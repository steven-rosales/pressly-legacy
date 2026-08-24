import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  CommitOrderRouteIdempotency,
  CommitOrderRouteReplay,
  CommitOrderRouteWorkEventCommand,
} from './execute.ts';
import type { CommitOrderRouteResult } from './types.ts';

export type StoredCommitOrderRouteWorkEvent =
  StoredCellWorkEvent<CommitOrderRouteResult>;

export const serializeCommitOrderRouteWorkEventCommand = (
  command: CommitOrderRouteWorkEventCommand,
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
    kind: command.payload.kind,
    authorizedAction: command.payload.authorizedAction,
    reason: command.payload.reason,
    restartStage: command.payload.restartStage,
    expectedQueueVersion: command.payload.expectedQueueVersion,
    expectedSourceBatchVersion: command.payload.expectedSourceBatchVersion,
    proposalHash: command.payload.proposalHash,
    ...(command.payload.kind === 'queued_move'
      ? {
          targetProductionBatchId: command.payload.targetProductionBatchId,
        }
      : command.payload.note === undefined
        ? {}
        : { note: command.payload.note }),
  },
});

const replayedResult = (
  result: CommitOrderRouteResult,
): CommitOrderRouteResult =>
  'replayed' in result ? { ...result, replayed: true } : result;

export const resolveCommitOrderRouteReplay = (
  stored: StoredCommitOrderRouteWorkEvent | null,
  expected: CommitOrderRouteWorkEventCommand,
): CommitOrderRouteReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeCommitOrderRouteWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const commitOrderRouteIdempotency: CommitOrderRouteIdempotency<StoredCommitOrderRouteWorkEvent> =
  Object.freeze({ resolveReplay: resolveCommitOrderRouteReplay });
