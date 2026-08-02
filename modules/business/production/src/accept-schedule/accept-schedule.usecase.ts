import {
  conflictError,
  databaseError,
  mapUnknownError,
  notFoundError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { AcceptScheduleResult } from '@pressly/contracts';
import { productionIdempotencyConflict } from '../command-execution/production-command.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../command-execution/production-idempotency.policy.ts';
import type { ClockPort } from '../command-execution/production-command.port.ts';
import type { ProductionPolicyPort } from '../production-policy/production-policy.port.ts';
import type {
  AcceptSchedule,
  AcceptScheduleRepository,
} from './accept-schedule.port.ts';
export type { AcceptSchedule } from './accept-schedule.port.ts';

type AcceptSchedulePolicy = Pick<
  ProductionPolicyPort,
  | 'evaluateShiftPlanningWindow'
  | 'evaluateScheduleRevisionTransition'
  | 'evaluateScheduleAcceptance'
  | 'evaluateCurrentPlanAcceptance'
>;

export const makeAcceptSchedule =
  (deps: {
    repo: AcceptScheduleRepository;
    policy: AcceptSchedulePolicy;
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

        await repo.lockLocationScheduling(command.locationId);
        const lockedReplay = resolveWorkEventReplay<AcceptScheduleResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (lockedReplay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (lockedReplay.tag === 'replay')
          return result.ok(lockedReplay.result);

        const acceptanceRecord = await repo.loadSchedule(
          command.locationId,
          command.scheduleRunId,
        );

        if (acceptanceRecord === null)
          return result.err(
            notFoundError({
              code: 'schedule_not_found',
              message: 'The schedule proposal was not found.',
              safeMessage: 'The schedule proposal was not found.',
            }),
          );
        const schedule = acceptanceRecord.schedule;

        const now = deps.clock.now();
        const shiftWindow = deps.policy.evaluateShiftPlanningWindow({
          action: 'accept',
          now,
          startsAt: new Date(acceptanceRecord.inputSnapshot.shift.startsAt),
          endsAt: new Date(acceptanceRecord.inputSnapshot.shift.endsAt),
        });
        if (shiftWindow.tag === 'err')
          return result.err(
            conflictError({
              code: shiftWindow.error.code.toLowerCase(),
              message: shiftWindow.error.message,
              safeMessage: shiftWindow.error.message,
            }),
          );

        if (
          await repo.productionRunExists(
            command.locationId,
            schedule.productionShiftId,
          )
        )
          return result.err(
            conflictError({
              code: 'production_shift_already_started',
              message: 'A production run already exists for this shift.',
              safeMessage: 'A production run already exists for this shift.',
            }),
          );

        const lifecycle = deps.policy.evaluateScheduleRevisionTransition({
          state: schedule.status,
          event: 'accept',
        });
        if (
          lifecycle.tag === 'err' ||
          lifecycle.value.from !== 'draft' ||
          lifecycle.value.state !== 'accepted'
        )
          return result.err(
            conflictError({
              code: 'schedule_not_draft',
              message: 'Only a draft schedule may be accepted.',
              safeMessage: 'Only a draft schedule may be accepted.',
            }),
          );

        const decision = deps.policy.evaluateScheduleAcceptance({
          expectedOutputPlanHash: command.expectedOutputPlanHash,
          actualOutputPlanHash: schedule.outputPlanHash,
          warningCodes: schedule.warnings.map((warning) => warning.code),
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
            conflictError({
              code: decision.error.code.toLowerCase(),
              message: decision.error.message,
              safeMessage: decision.error.message,
            }),
          );

        const eligibleOrderSnapshotMatches =
          await repo.lockAndValidateScheduleInput(
            command.locationId,
            acceptanceRecord,
          );
        const currentPlanDecision = deps.policy.evaluateCurrentPlanAcceptance({
          scheduleRunId: schedule.scheduleRunId,
          currentScheduleRunId: schedule.scheduleRunId,
          eligibleOrderSnapshotMatches,
        });
        if (currentPlanDecision.tag === 'err')
          return result.err(
            conflictError({
              code: currentPlanDecision.error.code.toLowerCase(),
              message: currentPlanDecision.error.message,
              safeMessage: currentPlanDecision.error.message,
            }),
          );

        return result.ok(
          await repo.acceptSchedule(
            command.locationId,
            schedule,
            command.actorId,
            command.acknowledgedWarningCodes,
            command.idempotencyKey,
            idempotency,
            lifecycle.value,
            now,
          ),
        );
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'schedule_accept_failed',
            message: 'The schedule proposal could not be accepted.',
            safeMessage: 'The schedule proposal could not be accepted.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
