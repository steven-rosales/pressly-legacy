import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  CommitOrderBacklogBulkCommandIdentity,
  CommitOrderBacklogIdempotency,
  CommitOrderBacklogOrderCommandIdentity,
  CommitOrderBacklogReplay,
} from './execute.ts';
import type { CommitOrderBacklogResult } from './types.ts';

export type StoredCommitOrderBacklogWorkEvent =
  StoredCellWorkEvent<CommitOrderBacklogResult>;

export const serializeCommitOrderBacklogBulkCommand = (
  command: CommitOrderBacklogBulkCommandIdentity,
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
    filter: command.payload.filter,
    cutoff: command.payload.cutoff,
    reason: command.payload.reason,
    note: command.payload.note,
    maxOrders: command.payload.maxOrders,
    cursor: command.payload.cursor,
    previewHash: command.payload.previewHash,
  },
});

export const serializeCommitOrderBacklogOrderCommand = (
  command: CommitOrderBacklogOrderCommandIdentity,
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
    bulkOperationId: command.payload.bulkOperationId,
    previewHash: command.payload.previewHash,
    reason: command.payload.reason,
  },
});

const replayedResult = (
  result: CommitOrderBacklogResult,
): CommitOrderBacklogResult => ({ ...result, replayed: true });

export const resolveCommitOrderBacklogReplay = (
  stored: StoredCommitOrderBacklogWorkEvent | null,
  expected: CommitOrderBacklogBulkCommandIdentity,
): CommitOrderBacklogReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeCommitOrderBacklogBulkCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const commitOrderBacklogIdempotency: CommitOrderBacklogIdempotency<StoredCommitOrderBacklogWorkEvent> =
  Object.freeze({ resolveReplay: resolveCommitOrderBacklogReplay });
