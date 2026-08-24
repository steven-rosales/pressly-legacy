import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  UpdateShiftIdempotency,
  UpdateShiftReplay,
  UpdateShiftWorkEventCommand,
} from './execute.ts';
import type { UpdateShiftResult } from './types.ts';

export type StoredUpdateShiftWorkEvent = StoredCellWorkEvent<UpdateShiftResult>;

export const serializeUpdateShiftWorkEventCommand = (
  command: UpdateShiftWorkEventCommand,
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
    effectiveFolderCount: command.payload.effectiveFolderCount,
  },
});

const replayedResult = (result: UpdateShiftResult): UpdateShiftResult => ({
  ...result,
  replayed: true,
});

export const resolveUpdateShiftReplay = (
  stored: StoredUpdateShiftWorkEvent | null,
  expected: UpdateShiftWorkEventCommand,
): UpdateShiftReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeUpdateShiftWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const updateShiftIdempotency: UpdateShiftIdempotency<StoredUpdateShiftWorkEvent> =
  Object.freeze({ resolveReplay: resolveUpdateShiftReplay });
