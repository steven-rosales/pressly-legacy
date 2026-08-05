import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import {
  conflictFailure,
  isProductionFeatureFailure,
  notFoundFailure,
  validationFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import {
  changedProductionShiftFields,
  isProductionShiftWindowValid,
} from '../../../foundations/language/shifts/production-shift.policy.ts';
import type { ProductionSignalsPort } from '../../../foundations/ports/signals/production-signals.port.ts';
import type { UpdateProductionShiftResult } from './update-production-shift.model.ts';
import type {
  UpdateProductionShift,
  UpdateProductionShiftRepository,
} from './update-production-shift.port.ts';

export const makeUpdateProductionShift = (deps: {
  repo: UpdateProductionShiftRepository;
  clock: Clock;
  policy: Pick<ProductionRules, 'evaluateScheduleRevisionTransition'>;
  signals?: ProductionSignalsPort;
}): UpdateProductionShift =>
  async function updateProductionShift(command) {
    if (!isProductionShiftWindowValid(command))
      return result.err(
        validationFailure({
          code: 'production_shift_window_invalid',
          message: 'Shift end must be after shift start.',
          safeMessage: 'Shift end must be after shift start.',
          classification: 'semantic',
        }),
      );

    try {
      const outcome = await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_shift_updated',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          expectedVersion: command.expectedVersion,
          payload: {
            startsAt: command.startsAt,
            endsAt: command.endsAt,
            effectiveFolderCount: command.effectiveFolderCount,
          },
        });
        const replay = resolveWorkEventReplay<UpdateProductionShiftResult>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        await repo.lockLocationScheduling(command.locationId);
        const replayAfterLock =
          resolveWorkEventReplay<UpdateProductionShiftResult>(
            await repo.findWorkEvent(command.idempotencyKey),
            idempotency,
          );
        if (replayAfterLock.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replayAfterLock.tag === 'replay')
          return result.ok(replayAfterLock.result);

        const current = await repo.lockShift(
          command.locationId,
          command.productionShiftId,
        );
        if (current === null)
          return result.err(
            notFoundFailure({
              code: 'production_shift_not_found',
              message: 'The production shift was not found.',
              safeMessage: 'The production shift was not found.',
            }),
          );
        if (current.version !== command.expectedVersion)
          return result.err(
            conflictFailure({
              code: 'production_shift_version_conflict',
              message:
                'The production shift changed before it could be updated.',
              safeMessage:
                'The production shift changed before it could be updated.',
            }),
          );
        if (current.status === 'closed')
          return result.err(
            conflictFailure({
              code: 'production_shift_closed',
              message: 'A closed production shift cannot be updated.',
              safeMessage: 'A closed production shift cannot be updated.',
            }),
          );
        if (
          await repo.productionRunExists(
            command.locationId,
            command.productionShiftId,
          )
        )
          return result.err(
            conflictFailure({
              code: 'production_shift_already_started',
              message: 'A production run already exists for this shift.',
              safeMessage: 'A production run already exists for this shift.',
            }),
          );

        const changedFields = changedProductionShiftFields(current, command);
        const now = deps.clock.now();
        let productionShift = current;
        let supersededScheduleRunId: string | null = null;

        if (changedFields.length > 0) {
          const updated = await repo.updateShift({
            locationId: command.locationId,
            productionShiftId: command.productionShiftId,
            startsAt: command.startsAt,
            endsAt: command.endsAt,
            effectiveFolderCount: command.effectiveFolderCount,
            expectedVersion: command.expectedVersion,
            now,
          });
          if (updated === null)
            throw conflictFailure({
              code: 'production_shift_version_conflict',
              message: 'Locked production shift changed unexpectedly.',
              safeMessage: 'Locked production shift changed unexpectedly.',
            });
          productionShift = updated;
          const currentSchedule = await repo.lockCurrentSchedule(
            command.locationId,
            command.productionShiftId,
          );
          if (currentSchedule !== null) {
            const lifecycle = deps.policy.evaluateScheduleRevisionTransition({
              state: currentSchedule.status,
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
                  message:
                    'The current schedule revision cannot be superseded.',
                  safeMessage:
                    'The current schedule revision cannot be superseded.',
                }),
              );
            supersededScheduleRunId = await repo.supersedeCurrentSchedule({
              locationId: command.locationId,
              scheduleRunId: currentSchedule.scheduleRunId,
              lifecycle: lifecycle.value,
              now,
            });
          }
        }

        const updateResult: UpdateProductionShiftResult = {
          productionShift,
          supersededScheduleRunId,
          replayed: false,
        };
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_updated',
          entityType: 'production_shift',
          entityId: command.productionShiftId,
          actorId: command.actorId,
          expectedVersion: command.expectedVersion,
          idempotencyKey: command.idempotencyKey,
          payload: {
            changedFields,
            previous: {
              startsAt: current.startsAt,
              endsAt: current.endsAt,
              effectiveFolderCount: current.effectiveFolderCount,
              version: current.version,
            },
            current: {
              startsAt: productionShift.startsAt,
              endsAt: productionShift.endsAt,
              effectiveFolderCount: productionShift.effectiveFolderCount,
              version: productionShift.version,
            },
            supersededScheduleRunId,
          },
          idempotency: { command: idempotency, result: updateResult },
        });

        return result.ok(updateResult);
      });
      if (
        outcome.tag === 'ok' &&
        !outcome.value.replayed &&
        outcome.value.supersededScheduleRunId !== null
      )
        deps.signals?.planSuperseded();
      return outcome;
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_shift_update_failed',
          message: 'The production shift could not be updated.',
          safeMessage: 'The production shift could not be updated.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
