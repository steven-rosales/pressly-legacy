import { bindCell, declareCommandCell } from '@pressly/cells';
import { resolveSourceClosedFulfillmentContract } from './contract.ts';
import {
  makeExecuteResolveSourceClosedFulfillment,
  type ResolveSourceClosedFulfillmentDependencies,
} from './execute.ts';
import {
  resolveSourceClosedFulfillmentOperationId,
  type ResolveSourceClosedFulfillmentCommand,
  type ResolveSourceClosedFulfillmentExpectedFailure,
  type ResolveSourceClosedFulfillmentResult,
} from './types.ts';

export const resolveSourceClosedFulfillmentCellDeclaration = declareCommandCell<
  ResolveSourceClosedFulfillmentCommand,
  ResolveSourceClosedFulfillmentResult,
  ResolveSourceClosedFulfillmentExpectedFailure
>({
  id: resolveSourceClosedFulfillmentOperationId,
  authentication: 'none',
  contract: resolveSourceClosedFulfillmentContract,
  consistency: { transaction: 'none', concurrency: 'none' },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
  },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: {
    operation: 'production.resolve_source_closed_fulfillment',
  },
});

export const makeResolveSourceClosedFulfillmentCell = (
  deps: ResolveSourceClosedFulfillmentDependencies,
) =>
  bindCell(
    resolveSourceClosedFulfillmentCellDeclaration,
    makeExecuteResolveSourceClosedFulfillment(deps),
  );
