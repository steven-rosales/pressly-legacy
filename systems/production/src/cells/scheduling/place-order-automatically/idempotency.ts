import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  PlaceOrderAutomaticallyIdempotency,
  PlaceOrderAutomaticallyReplay,
  PlaceOrderAutomaticallyWorkEventCommand,
} from './execute.ts';
import type { AutomaticProductionOrderPlacementResult } from './types.ts';

export type StoredPlaceOrderAutomaticallyWorkEvent =
  StoredCellWorkEvent<AutomaticProductionOrderPlacementResult>;

export const serializePlaceOrderAutomaticallyWorkEventCommand = (
  command: PlaceOrderAutomaticallyWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: command.expectedVersion,
  payload: { ...command.payload },
});

export const resolvePlaceOrderAutomaticallyReplay = (
  stored: StoredPlaceOrderAutomaticallyWorkEvent | null,
  expected: PlaceOrderAutomaticallyWorkEventCommand,
): PlaceOrderAutomaticallyReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializePlaceOrderAutomaticallyWorkEventCommand(expected))
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

export const placeOrderAutomaticallyIdempotency: PlaceOrderAutomaticallyIdempotency<StoredPlaceOrderAutomaticallyWorkEvent> =
  Object.freeze({ resolveReplay: resolvePlaceOrderAutomaticallyReplay });
