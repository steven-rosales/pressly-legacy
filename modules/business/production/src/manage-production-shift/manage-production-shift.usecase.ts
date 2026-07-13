import { result } from '@pressly/kernel';
import type { ProductionShift } from '@pressly/contracts';
import {
  productionError,
  productionIdempotencyConflict,
} from '../production.error.ts';
import {
  defineWorkEventCommand,
  resolveWorkEventReplay,
} from '../production-idempotency.policy.ts';
import type { ClockPort, IdPort } from '../production.port.ts';
import type {
  CreateProductionShift,
  ManageProductionShiftRepository,
} from './manage-production-shift.port.ts';
export type { CreateProductionShift } from './manage-production-shift.port.ts';

export const makeCreateProductionShift =
  (deps: {
    repo: ManageProductionShiftRepository;
    clock: ClockPort;
    ids: IdPort;
  }): CreateProductionShift =>
  async (command) => {
    if (Date.parse(command.endsAt) <= Date.parse(command.startsAt))
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_WINDOW_INVALID',
          'Shift end must be after shift start.',
          422,
        ),
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
          status: 'open' as const,
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
      return result.err(
        productionError(
          'PRODUCTION_SHIFT_CREATE_FAILED',
          'The production shift could not be created.',
          409,
          error,
        ),
      );
    }
  };
