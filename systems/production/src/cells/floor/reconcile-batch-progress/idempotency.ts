import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ReconcileBatchProgressIdempotency,
  ReconcileBatchProgressReplay,
  ReconcileBatchProgressWorkEventCommand,
} from './execute.ts';
import type { ReconciledBatchProgress } from './types.ts';

export type StoredReconcileBatchProgressWorkEvent =
  StoredCellWorkEvent<ReconciledBatchProgress>;

export const serializeReconcileBatchProgressWorkEventCommand = (
  command: ReconcileBatchProgressWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: command.expectedVersion,
  payload: command.payload,
});

export const resolveReconcileBatchProgressReplay = (
  stored: StoredReconcileBatchProgressWorkEvent | null,
  expected: ReconcileBatchProgressWorkEventCommand,
): ReconcileBatchProgressReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeReconcileBatchProgressWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return {
    kind: 'replay',
    result: {
      ...stored.result,
      replayed: true,
    },
  };
};

export const reconcileBatchProgressIdempotency: ReconcileBatchProgressIdempotency<StoredReconcileBatchProgressWorkEvent> =
  Object.freeze({ resolveReplay: resolveReconcileBatchProgressReplay });
