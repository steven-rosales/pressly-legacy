import { databaseError } from '@pressly/errors/factories';
import { mapUnknownError } from '@pressly/errors/app-error';
import { result } from '@pressly/kernel';
import type { IdSource } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import { productionIdempotencyConflict } from '../../../foundations/language/commands/production-command.failure.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../../../foundations/language/commands/production-idempotency.policy.ts';
import {
  isProductionFeatureFailure,
  validationFailure,
} from '../../../foundations/language/failures/production-failure.factory.ts';
import type { ProductionRules } from '../../../foundations/language/rules/production-rules.model.ts';
import type { ProductionShift } from '../../../foundations/language/shifts/production-shift.entity.ts';
import { isProductionShiftWindowValid } from '../../../foundations/language/shifts/production-shift.policy.ts';
import type {
  CreateProductionShift,
  CreateProductionShiftRepository,
} from './create-production-shift.port.ts';

export const makeCreateProductionShift = (deps: {
  repo: CreateProductionShiftRepository;
  clock: Clock;
  ids: IdSource;
  policy: Pick<ProductionRules, 'initialProductionShiftState'>;
}): CreateProductionShift =>
  async function createProductionShift(command) {
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
      return await deps.repo.transaction(async (repo) => {
        const idempotency = defineWorkEventCommand({
          operation: 'production_shift_created',
          locationId: command.locationId,
          actorId: command.actorId,
          entityType: 'production_shift',
          payload: {
            startsAt: command.startsAt,
            endsAt: command.endsAt,
            timezone: command.timezone,
            effectiveFolderCount: command.effectiveFolderCount,
          },
        });
        const replay = resolveWorkEventReplay<ProductionShift>(
          await repo.findWorkEvent(command.idempotencyKey),
          idempotency,
        );
        if (replay.tag === 'conflict')
          return result.err(productionIdempotencyConflict());
        if (replay.tag === 'replay') return result.ok(replay.result);

        const shift = {
          id: deps.ids.next(),
          locationId: command.locationId,
          startsAt: command.startsAt,
          endsAt: command.endsAt,
          timezone: command.timezone,
          effectiveFolderCount: command.effectiveFolderCount,
          status: deps.policy.initialProductionShiftState,
          version: 1,
        };

        await repo.saveShift(shift);
        await repo.appendWorkEvent({
          locationId: command.locationId,
          eventType: 'production_shift_created',
          entityType: 'production_shift',
          entityId: shift.id,
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          payload: { startsAt: shift.startsAt, endsAt: shift.endsAt },
          idempotency: { command: idempotency, result: shift },
        });

        return result.ok(shift);
      });
    } catch (error) {
      if (isProductionFeatureFailure(error)) return result.err(error);
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'production_shift_create_failed',
          message: 'The production shift could not be created.',
          safeMessage: 'The production shift could not be created.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
