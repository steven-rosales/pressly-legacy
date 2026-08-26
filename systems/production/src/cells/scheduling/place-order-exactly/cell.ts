import { defineOperation } from '@pressly/cells';
import { placeOrderExactlyContract } from './contract.ts';
import {
  makeExecutePlaceOrderExactly,
  type PlaceOrderExactlyDependencies,
} from './execute.ts';
import { placeOrderExactlyHttpSurfaces } from './http.ts';
import {
  placeOrderExactlyOperationId,
  type PlaceOrderExactlyCommand,
  type PlaceOrderExactlyExpectedFailure,
  type PlaceOrderExactlyResult,
} from './types.ts';

export const placeOrderExactlyCellDeclaration = defineOperation<
  PlaceOrderExactlyCommand,
  PlaceOrderExactlyResult,
  PlaceOrderExactlyExpectedFailure
>({
  kind: 'command',
  id: placeOrderExactlyOperationId,
  contract: placeOrderExactlyContract,
  authorization: {
    capability: 'production:override',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) =>
      `${input.expectedQueueVersion}:${input.expectedBatchVersion}`,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: placeOrderExactlyHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.place_order_exactly' },
});

export const makePlaceOrderExactlyCell = <StoredWorkEvent>(
  dependencies: PlaceOrderExactlyDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    placeOrderExactlyCellDeclaration,
    makeExecutePlaceOrderExactly(dependencies),
  );
