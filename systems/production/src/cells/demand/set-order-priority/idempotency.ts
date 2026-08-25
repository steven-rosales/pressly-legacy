import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  SetOrderPriorityIdempotency,
  SetOrderPriorityReplay,
  SetOrderPriorityWorkEventCommand,
} from './execute.ts';
import type { SetOrderPriorityResult } from './types.ts';

export type StoredSetOrderPriorityWorkEvent =
  StoredCellWorkEvent<SetOrderPriorityResult>;

export const serializeSetOrderPriorityWorkEventCommand = (
  command: SetOrderPriorityWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: command.expectedVersion,
  payload: { priority: command.payload.priority },
});

const replayedResult = (
  result: SetOrderPriorityResult,
): SetOrderPriorityResult => ({ ...result, replayed: true });

export const resolveSetOrderPriorityReplay = (
  stored: StoredSetOrderPriorityWorkEvent | null,
  expected: SetOrderPriorityWorkEventCommand,
): SetOrderPriorityReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeSetOrderPriorityWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const setOrderPriorityIdempotency: SetOrderPriorityIdempotency<StoredSetOrderPriorityWorkEvent> =
  Object.freeze({ resolveReplay: resolveSetOrderPriorityReplay });
