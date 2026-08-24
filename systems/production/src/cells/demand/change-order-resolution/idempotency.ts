import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ChangeOrderResolutionIdempotency,
  ChangeOrderResolutionReplay,
  ChangeOrderResolutionWorkEventCommand,
} from './execute.ts';
import type { ChangeOrderResolutionResult } from './types.ts';

export type StoredChangeOrderResolutionWorkEvent =
  StoredCellWorkEvent<ChangeOrderResolutionResult>;

export const serializeChangeOrderResolutionWorkEventCommand = (
  command: ChangeOrderResolutionWorkEventCommand,
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
    action: command.payload.action,
    reason: command.payload.reason,
    note: command.payload.note,
    ...(command.payload.confirmReviewedFacts === undefined
      ? {}
      : { confirmReviewedFacts: command.payload.confirmReviewedFacts }),
    ...(command.payload.sourceStatePrecondition === undefined
      ? {}
      : { sourceStatePrecondition: command.payload.sourceStatePrecondition }),
  },
});

const replayedResult = (
  result: ChangeOrderResolutionResult,
): ChangeOrderResolutionResult =>
  'replayed' in result ? { ...result, replayed: true } : result;

export const resolveChangeOrderResolutionReplay = (
  stored: StoredChangeOrderResolutionWorkEvent | null,
  expected: ChangeOrderResolutionWorkEventCommand,
): ChangeOrderResolutionReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeChangeOrderResolutionWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const changeOrderResolutionIdempotency: ChangeOrderResolutionIdempotency<StoredChangeOrderResolutionWorkEvent> =
  Object.freeze({ resolveReplay: resolveChangeOrderResolutionReplay });
