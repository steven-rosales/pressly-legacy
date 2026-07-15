import { result } from '@pressly/kernel';
import type { ScheduleProposal } from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type {
  ClockPort,
  IdPort,
  ProductionPolicyPort,
  ProductionSignalsPort,
  ProductionSchedulerPort,
} from '../production.port.ts';
import type {
  CreateSchedule,
  CreateScheduleRepository,
} from './create-schedule.port.ts';
export type { CreateSchedule } from './create-schedule.port.ts';

export const makeCreateSchedule =
  (deps: {
    repo: CreateScheduleRepository;
    scheduler: ProductionSchedulerPort;
    policy: ProductionPolicyPort;
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
            productionError(
              'PRODUCTION_SHIFT_NOT_FOUND',
              'The production shift was not found.',
              404,
            ),
          );
        if (planningState === 'run_exists')
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_ALREADY_STARTED',
              'A production run already exists for this shift.',
              409,
            ),
          );

        const schedulingInput = await repo.loadSchedulingInput(command);

        if (schedulingInput === null)
          return result.err(
            productionError(
              'SCHEDULING_INPUT_NOT_FOUND',
              'The shift or scheduler configuration was not found.',
              404,
            ),
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
            productionError(
              shiftWindow.error.code,
              shiftWindow.error.message,
              409,
            ),
          );

        const output = deps.scheduler.propose(schedulingInput);
        supersededCurrentPlan = await repo.currentPlanExists(
          command.locationId,
          command.productionShiftId,
        );
        const schedule = await repo.saveSchedule({
          locationId: command.locationId,
          id: deps.ids.next(),
          schedulingInput,
          output,
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
        productionError(
          'SCHEDULE_CREATE_FAILED',
          'The schedule proposal could not be created.',
          500,
          error,
        ),
      );
    }
  };
