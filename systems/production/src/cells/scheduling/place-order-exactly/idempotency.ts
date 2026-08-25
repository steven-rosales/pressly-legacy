import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  PlaceOrderExactlyIdempotency,
  PlaceOrderExactlyReplay,
  PlaceOrderExactlyWorkEventCommand,
} from './execute.ts';
import type { PlaceOrderExactlyResult } from './types.ts';

export type StoredPlaceOrderExactlyWorkEvent =
  StoredCellWorkEvent<PlaceOrderExactlyResult>;

export const serializePlaceOrderExactlyWorkEventCommand = (
  command: PlaceOrderExactlyWorkEventCommand,
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
    expectedQueueVersion: command.payload.expectedQueueVersion,
    authorizedAction: command.payload.authorizedAction,
    expectedBatchVersion: command.payload.expectedBatchVersion,
    mode: command.payload.mode,
    productionBatchId: command.payload.productionBatchId,
  },
});

const replayedResult = (
  result: PlaceOrderExactlyResult,
): PlaceOrderExactlyResult =>
  result.status === 'confirmation_required'
    ? result
    : { ...result, replayed: true };

export const resolvePlaceOrderExactlyReplay = (
  stored: StoredPlaceOrderExactlyWorkEvent | null,
  expected: PlaceOrderExactlyWorkEventCommand,
): PlaceOrderExactlyReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializePlaceOrderExactlyWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const placeOrderExactlyIdempotency: PlaceOrderExactlyIdempotency<StoredPlaceOrderExactlyWorkEvent> =
  Object.freeze({ resolveReplay: resolvePlaceOrderExactlyReplay });
