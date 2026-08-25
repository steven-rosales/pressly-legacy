import { bindCell, declareCommandCell } from '@pressly/cells';
import { setOrderPriorityContract } from './contract.ts';
import { setOrderPriorityOperationId } from './decide.ts';
import {
  makeExecuteSetOrderPriority,
  type SetOrderPriorityDependencies,
} from './execute.ts';
import { setOrderPriorityHttpSurfaces } from './http.ts';
import type {
  SetOrderPriorityCommand,
  SetOrderPriorityExpectedFailure,
  SetOrderPriorityResult,
} from './types.ts';

export const setOrderPriorityCellDeclaration = declareCommandCell<
  SetOrderPriorityCommand,
  SetOrderPriorityResult,
  SetOrderPriorityExpectedFailure
>({
  id: setOrderPriorityOperationId,
  contract: setOrderPriorityContract,
  authorization: {
    capability: 'production:priority',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
  },
  surfaces: setOrderPriorityHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.set_order_priority' },
});

export const makeSetOrderPriorityCell = <StoredWorkEvent>(
  deps: SetOrderPriorityDependencies<StoredWorkEvent>,
) =>
  bindCell(setOrderPriorityCellDeclaration, makeExecuteSetOrderPriority(deps));
