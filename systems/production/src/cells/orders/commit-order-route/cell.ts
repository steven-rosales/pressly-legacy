import { bindCell, declareCommandCell } from '@pressly/cells';
import { commitOrderRouteContract } from './contract.ts';
import {
  makeExecuteCommitOrderRoute,
  type CommitOrderRouteDependencies,
} from './execute.ts';
import { commitOrderRouteHttpSurfaces } from './http.ts';
import {
  commitOrderRouteOperationId,
  type CommitOrderRouteCommand,
  type CommitOrderRouteExpectedFailure,
  type CommitOrderRouteResult,
} from './types.ts';

export const commitOrderRouteCellDeclaration = declareCommandCell<
  CommitOrderRouteCommand,
  CommitOrderRouteResult,
  CommitOrderRouteExpectedFailure
>({
  id: commitOrderRouteOperationId,
  contract: commitOrderRouteContract,
  authorization: {
    capability: 'production:stage',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) =>
      `${input.expectedQueueVersion}:${input.expectedOrderVersion}:${input.expectedSourceBatchVersion}:${input.proposalHash}`,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: commitOrderRouteHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.commit_order_route' },
});

export const makeCommitOrderRouteCell = <StoredWorkEvent>(
  dependencies: CommitOrderRouteDependencies<StoredWorkEvent>,
) =>
  bindCell(
    commitOrderRouteCellDeclaration,
    makeExecuteCommitOrderRoute(dependencies),
  );
