import { defineOperation } from '@pressly/cells';
import { placeOrderAutomaticallyContract } from './contract.ts';
import { placeOrderAutomaticallyOperationId } from './decide.ts';
import {
  makeExecutePlaceOrderAutomatically,
  type PlaceOrderAutomaticallyDependencies,
} from './execute.ts';
import { placeOrderAutomaticallyHttpSurfaces } from './http.ts';
import type {
  AutomaticProductionOrderPlacementResult,
  PlaceOrderAutomaticallyExpectedFailure,
  PlaceProductionOrderAutomaticallyCommand,
} from './types.ts';

export const placeOrderAutomaticallyCellDeclaration = defineOperation<
  PlaceProductionOrderAutomaticallyCommand,
  AutomaticProductionOrderPlacementResult,
  PlaceOrderAutomaticallyExpectedFailure
>({
  kind: 'command',
  id: placeOrderAutomaticallyOperationId,
  contract: placeOrderAutomaticallyContract,
  authorization: {
    capability: 'production:override',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedQueueVersion,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: placeOrderAutomaticallyHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.place_order_automatically' },
});

export const makePlaceOrderAutomaticallyCell = <StoredWorkEvent>(
  deps: PlaceOrderAutomaticallyDependencies<StoredWorkEvent>,
) =>
  defineOperation(
    placeOrderAutomaticallyCellDeclaration,
    makeExecutePlaceOrderAutomatically(deps),
  );
