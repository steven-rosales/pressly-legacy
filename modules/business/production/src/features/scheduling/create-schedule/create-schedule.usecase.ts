import {
  conflictFailure,
  notFoundFailure,
  isProductionFeatureFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { projectScheduleProposalJson } from '../../../foundations/language/scheduling/schedule-proposal-json.projection.ts';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.factory.ts';
import type { ProductionSignalsPort } from '../../../foundations/ports/signals/production-signals.port.ts';
import type { ProductionAlgorithmRegistry } from '../../../foundations/algorithms/approved-production/production-algorithm-registry.factory.ts';
import type { ScheduleSupersessionDecision } from '../../../foundations/language/execution/production-lifecycle.model.ts';
import type {
  CreateSchedule,
  CreateScheduleRepository,
} from './create-schedule.port.ts';
import type { CreateScheduleResult } from './create-schedule.model.ts';
export type { CreateSchedule } from './create-schedule.port.ts';

type CreateSchedulePolicy = Pick<
  ProductionRules,
  | 'evaluateShiftPlanningWindow'
  | 'evaluateScheduleRevisionTransition'
  | 'initialScheduleRevisionState'
>;

export const makeCreateSchedule =
  (deps: {
    repo: CreateScheduleRepository;
    scheduler: Pick<ProductionAlgorithmRegistry, 'propose'>;
    policy: CreateSchedulePolicy;
    clock: Clock;
    ids: IdSource;
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
        const replay = resolveWorkEventReplay<CreateScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = resolveWorkEventReplay<CreateScheduleResult>(
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
            notFoundFailure({
              code: 'production_shift_not_found',
              message: 'The production shift was not found.',
              safeMessage: 'The production shift was not found.',
            }),
          );
        if (planningState === 'run_exists')
          return result.err(
            conflictFailure({
              code: 'production_shift_already_started',
              message: 'A production run already exists for this shift.',
              safeMessage: 'A production run already exists for this shift.',
            }),
          );

        const schedulingInput = await repo.loadSchedulingInput(command);

        if (schedulingInput === null)
          return result.err(
            notFoundFailure({
              code: 'scheduling_input_not_found',
              message: 'The shift or scheduler configuration was not found.',
              safeMessage:
                'The shift or scheduler configuration was not found.',
            }),
          );
        if (schedulingInput === 'selection_empty')
          return result.err(
            conflictFailure({
              code: 'schedule_selection_empty',
              message:
                'Select at least one ready order before computing the schedule.',
              safeMessage:
                'Select at least one ready order before computing the schedule.',
            }),
          );
        if (schedulingInput === 'selection_invalid')
          return result.err(
            conflictFailure({
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
            conflictFailure({
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
              conflictFailure({
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
          idempotency: {
            command: idempotency,
            result: projectScheduleProposalJson(schedule),
          },
        });

        return result.ok(schedule);
      });
      if (outcome.tag === 'ok' && supersededCurrentPlan)
        deps.signals?.planSuperseded();
      return outcome;
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'schedule_create_failed',
          message: 'The schedule proposal could not be created.',
          safeMessage: 'The schedule proposal could not be created.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
