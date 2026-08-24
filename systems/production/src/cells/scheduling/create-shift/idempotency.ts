import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  CreateShiftIdempotency,
  CreateShiftReplay,
  CreateShiftWorkEventCommand,
} from './execute.ts';
import type { ProductionShift } from './types.ts';

export type StoredCreateShiftWorkEvent = StoredCellWorkEvent<ProductionShift>;

export const serializeCreateShiftWorkEventCommand = (
  command: CreateShiftWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: command.expectedVersion,
  payload: {
    startsAt: command.payload.startsAt,
    endsAt: command.payload.endsAt,
    timezone: command.payload.timezone,
    effectiveFolderCount: command.payload.effectiveFolderCount,
  },
});

export const resolveCreateShiftReplay = (
  stored: StoredCreateShiftWorkEvent | null,
  expected: CreateShiftWorkEventCommand,
): CreateShiftReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeCreateShiftWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  const replayed =
    'replayed' in stored.result
      ? { ...stored.result, replayed: true }
      : stored.result;
  return {
    kind: 'replay',
    result: replayed,
  };
};

export const createShiftIdempotency: CreateShiftIdempotency<StoredCreateShiftWorkEvent> =
  Object.freeze({ resolveReplay: resolveCreateShiftReplay });
