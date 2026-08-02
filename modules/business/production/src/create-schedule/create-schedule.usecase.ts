import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { ScheduleProposal } from '@pressly/contracts';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type {
  ClockPort,
  IdPort,
} from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type { ProductionSignalsPort } from '../production-signals/production-signals.port.ts';
import type { ProductionSchedulerPort } from '../scheduling/production-scheduler.port.ts';
import type { ScheduleSupersessionDecision } from '../production-lifecycle/production-lifecycle.model.ts';
import type {
  CreateSchedule,
  CreateScheduleRepository,
} from './create-schedule.port.ts';
export type { CreateSchedule } from './create-schedule.port.ts';

type CreateSchedulePolicy = Pick<
  ProductionPolicyPort,
  | 'evaluateShiftPlanningWindow'
  | 'evaluateScheduleRevisionTransition'
  | 'initialScheduleRevisionState'
>;

export const makeCreateSchedule =
  (deps: {
    repo: CreateScheduleRepository;
    scheduler: Pick<ProductionSchedulerPort, 'propose'>;
    policy: CreateSchedulePolicy;
    clock: ClockPort;
    ids: IdPort;
    signals?: ProductionSignalsPort;
  }): CreateSchedule =>
  async (command) => {
    let supersededCurrentPlan = false;
    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'schedule_computed',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'schedule_run',
          payload: {
            productionShiftId: command.productionShiftId,
            schedulerConfigId: command.schedulerConfigId,
          },
        });
        const replay = resolveWorkEventReplay<ScheduleProposal>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = resolveWorkEventReplay<ScheduleProposal>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (lockedReplay.tag === 'replay')
          return result.ok(lockedReplay.result);

        const planningState = await repo.lockShiftForPlanning(
          command.locationId,
          command.productionShiftId,
        );
        if (planningState === 'not_found')
          return result.err(
            notFoundError({
              code: 'production_shift_not_found',
              message: 'The production shift was not found.',
              safeMessage: 'The production shift was not found.',
            }),
          );
        if (planningState === 'run_exists')
          return result.err(
            conflictError({
              code: 'production_shift_already_started',
              message: 'A production run already exists for this shift.',
              safeMessage: 'A production run already exists for this shift.',
            }),
          );

        const schedulingInput = await repo.loadSchedulingInput(command);

        if (schedulingInput === null)
          return result.err(
            notFoundError({
              code: 'scheduling_input_not_found',
              message: 'The shift or scheduler configuration was not found.',
              safeMessage:
                'The shift or scheduler configuration was not found.',
            }),
          );
        if (schedulingInput === 'selection_empty')
          return result.err(
            conflictError({
              code: 'schedule_selection_empty',
              message:
                'Select at least one ready order before computing the schedule.',
              safeMessage:
                'Select at least one ready order before computing the schedule.',
            }),
          );
        if (schedulingInput === 'selection_invalid')
          return result.err(
            conflictError({
              code: 'schedule_selection_not_ready',
              message:
                'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
              safeMessage:
                'One or more selected orders are no longer ready to schedule. Refresh the shift and review the selection.',
            }),
          );

        const now = deps.clock.now();
        const shiftWindow = deps.policy.evaluateShiftPlanningWindow({
          action: 'compute',
          now,
          startsAt: new Date(schedulingInput.shift.startsAt),
          endsAt: new Date(schedulingInput.shift.endsAt),
        });
        if (shiftWindow.tag === 'err')
          return result.err(
            conflictError({
              code: shiftWindow.error.code.toLowerCase(),
              message: shiftWindow.error.message,
              safeMessage: shiftWindow.error.message,
            }),
          );

        const output = deps.scheduler.propose(schedulingInput);
        const currentPlan = await repo.loadCurrentPlan(
          command.locationId,
          command.productionShiftId,
        );
        let supersede: ScheduleSupersessionDecision | null = null;
        if (currentPlan !== null) {
          const lifecycle = deps.policy.evaluateScheduleRevisionTransition({
            state: currentPlan.status,
            event: 'supersede',
          });
          if (
            lifecycle.tag === 'err' ||
            (lifecycle.value.from !== 'draft' &&
              lifecycle.value.from !== 'accepted') ||
            lifecycle.value.state !== 'superseded'
          )
            return result.err(
              conflictError({
                code: 'schedule_current_plan_state_invalid',
                message: 'The current schedule revision cannot be superseded.',
                safeMessage:
                  'The current schedule revision cannot be superseded.',
              }),
            );
          supersede = {
            scheduleRunId: currentPlan.scheduleRunId,
            lifecycle: lifecycle.value,
          };
        }
        supersededCurrentPlan = supersede !== null;
        const schedule = await repo.saveSchedule({
          locationId: command.locationId,
          id: deps.ids.next(),
          schedulingInput,
          output,
          initialStatus: deps.policy.initialScheduleRevisionState,
          supersede,
          now,
        });

        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'schedule_computed',
          entityType: 'schedule_run',
          entityId: schedule.scheduleRunId,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: {
            productionShiftId: schedule.productionShiftId,
            inputSnapshotHash: schedule.inputSnapshotHash,
            outputPlanHash: schedule.outputPlanHash,
          },
          idempotency: { command: idempotency, result: schedule },
        });

        return result.ok(schedule);
      });
      if (outcome.tag === 'ok' && supersededCurrentPlan)
        deps.signals?.planSuperseded();
      return outcome;
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'schedule_create_failed',
            message: 'The schedule proposal could not be created.',
            safeMessage: 'The schedule proposal could not be created.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
