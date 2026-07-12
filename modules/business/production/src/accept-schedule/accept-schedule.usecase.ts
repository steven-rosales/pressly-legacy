import { result } from '@pressly/kernel';
import type { AcceptScheduleResult } from '@pressly/contracts';
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
  AcceptSchedule,
  AcceptScheduleRepository,
} from './accept-schedule.port.ts';
export type { AcceptSchedule } from './accept-schedule.port.ts';

export const makeAcceptSchedule =
  (deps: {
    repo: AcceptScheduleRepository;
    policy: ProductionPolicyPort;
    clock: ClockPort;
  }): AcceptSchedule =>
  async (command) => {
    try {
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'schedule_accepted',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'schedule_run',
          entityId: command.scheduleRunId,
          payload: {
            expectedOutputPlanHash: command.expectedOutputPlanHash,
            acknowledgedWarningCodes: [...command.acknowledgedWarningCodes],
          },
        });
        const replay = resolveWorkEventReplay<AcceptScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const acceptanceRecord = await repo.loadSchedule(
          command.locationId,
          command.scheduleRunId,
        );

        if (acceptanceRecord === null)
          return result.err(
            productionError(
              'SCHEDULE_NOT_FOUND',
              'The schedule proposal was not found.',
              404,
            ),
          );
        const schedule = acceptanceRecord.schedule;

        const decision = deps.policy.evaluateScheduleAcceptance({
          status: schedule.status,
          expectedOutputPlanHash: command.expectedOutputPlanHash,
          actualOutputPlanHash: schedule.outputPlanHash,
          blockingWarningCodes: schedule.warnings
            .filter((warning) => warning.blocking)
            .map((warning) => warning.code),
          acknowledgedWarningCodes: command.acknowledgedWarningCodes,
          batches: schedule.batches.map((batch) => ({
            weightLbs: batch.derivedWeightLbs,
            capacityLbs: schedule.pulseCapacityLbs,
            orderIds: batch.orderIds,
            stages: batch.stages.map((stage) => ({
              stage: stage.stage,
              startsAt: new Date(stage.startsAt),
              endsAt: new Date(stage.endsAt),
              pulseMinutes: schedule.pulseMinutes,
            })),
          })),
        });

        if (decision.tag === 'err')
          return result.err(
            productionError(decision.error.code, decision.error.message, 409),
          );

        if (
          !(await repo.lockAndValidateSelectedOrders(
            command.locationId,
            acceptanceRecord,
          ))
        )
          return result.err(
            productionError(
              'SCHEDULE_INPUT_DRIFTED',
              'One or more selected orders changed after this proposal was created.',
              409,
            ),
          );

        return result.ok(
          await repo.acceptSchedule(
            command.locationId,
            schedule,
            command.actorId,
            command.idempotencyKey,
            idempotency,
            deps.clock.now(),
          ),
        );
      });
    } catch (error) {
      return result.err(
        productionError(
          'SCHEDULE_ACCEPT_FAILED',
          'The schedule proposal could not be accepted.',
          409,
          error,
        ),
      );
    }
  };
