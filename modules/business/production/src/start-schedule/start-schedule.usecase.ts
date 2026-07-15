import type { StartScheduleResult } from '@pressly/contracts';
import { result } from '@pressly/kernel';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type { ClockPort, ProductionPolicyPort } from '../production.port.ts';
import type {
  StartSchedule,
  StartScheduleRepository,
} from './start-schedule.port.ts';
export type { StartSchedule } from './start-schedule.port.ts';

export const makeStartSchedule =
  (deps: {
    repo: StartScheduleRepository;
    clock: ClockPort;
    policy: ProductionPolicyPort;
  }): StartSchedule =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_run_started',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'schedule_run',
          entityId: command.scheduleRunId,
          payload: { expectedOutputPlanHash: command.expectedOutputPlanHash },
        });
        const replay = resolveWorkEventReplay<StartScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = resolveWorkEventReplay<StartScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (lockedReplay.tag === 'replay')
          return result.ok(lockedReplay.result);

        const record = await repo.loadSchedule(
          command.locationId,
          command.scheduleRunId,
        );
        if (record === null)
          return result.err(
            productionError(
              'SCHEDULE_NOT_FOUND',
              'The accepted schedule was not found.',
              404,
            ),
          );
        if (record.schedule.outputPlanHash !== command.expectedOutputPlanHash)
          return result.err(
            productionError(
              'SCHEDULE_HASH_MISMATCH',
              'The accepted schedule hash does not match the Start command.',
              409,
            ),
          );
        if (
          !(await repo.lockShiftForStart(
            command.locationId,
            record.schedule.productionShiftId,
          ))
        )
          return result.err(
            productionError(
              'PRODUCTION_SHIFT_NOT_FOUND',
              'The production shift was not found.',
              404,
            ),
          );
        const now = deps.clock.now();
        const shiftWindow = deps.policy.evaluateShiftPlanningWindow({
          action: 'start',
          now,
          startsAt: new Date(record.inputSnapshot.shift.startsAt),
          endsAt: new Date(record.inputSnapshot.shift.endsAt),
        });
        if (shiftWindow.tag === 'err')
          return result.err(
            productionError(
              shiftWindow.error.code,
              shiftWindow.error.message,
              409,
            ),
          );
        const productionRunExists = await repo.productionRunExists(
          command.locationId,
          record.schedule.productionShiftId,
        );
        const eligibleOrderSnapshotMatches =
          await repo.lockAndValidateScheduleInput(command.locationId, record);
        const startDecision = deps.policy.evaluateScheduleStart({
          scheduleRunId: record.schedule.scheduleRunId,
          status: record.schedule.status,
          currentScheduleRunId:
            record.schedule.status === 'accepted'
              ? record.schedule.scheduleRunId
              : null,
          eligibleOrderSnapshotMatches,
          productionRunExists,
          batchCount: record.schedule.batches.length,
        });
        if (startDecision.tag === 'err')
          return result.err(
            productionError(
              startDecision.error.code,
              startDecision.error.message,
              409,
            ),
          );

        return result.ok(
          await repo.startSchedule({
            locationId: command.locationId,
            record,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            idempotency,
            now,
          }),
        );
      });
    } catch (error) {
      return result.err(
        productionError(
          'PRODUCTION_RUN_START_FAILED',
          'Production could not start from the accepted schedule.',
          409,
          error,
        ),
      );
    }
  };
