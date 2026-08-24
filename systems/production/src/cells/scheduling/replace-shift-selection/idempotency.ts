import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ReplaceShiftSelectionIdempotency,
  ReplaceShiftSelectionReplay,
  ReplaceShiftSelectionWorkEventCommand,
} from './execute.ts';
import type { ReplaceShiftSelectionResult } from './types.ts';

export type StoredReplaceShiftSelectionWorkEvent =
  StoredCellWorkEvent<ReplaceShiftSelectionResult>;

export const serializeReplaceShiftSelectionWorkEventCommand = (
  command: ReplaceShiftSelectionWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: command.expectedVersion,
  payload: { selectedOrderIds: [...command.payload.selectedOrderIds] },
});

const replayedResult = (
  result: ReplaceShiftSelectionResult,
): ReplaceShiftSelectionResult => ({ ...result, replayed: true });

export const resolveReplaceShiftSelectionReplay = (
  stored: StoredReplaceShiftSelectionWorkEvent | null,
  expected: ReplaceShiftSelectionWorkEventCommand,
): ReplaceShiftSelectionReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeReplaceShiftSelectionWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const replaceShiftSelectionIdempotency: ReplaceShiftSelectionIdempotency<StoredReplaceShiftSelectionWorkEvent> =
  Object.freeze({ resolveReplay: resolveReplaceShiftSelectionReplay });
