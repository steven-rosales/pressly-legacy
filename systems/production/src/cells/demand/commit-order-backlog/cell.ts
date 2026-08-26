import { defineOperation } from '@pressly/cells';
import { commitOrderBacklogContract } from './contract.ts';
import {
  makeExecuteCommitOrderBacklog,
  type CommitOrderBacklogDependencies,
} from './execute.ts';
import { commitOrderBacklogHttpSurfaces } from './http.ts';
import {
  commitOrderBacklogOperationId,
  type CommitOrderBacklogCommand,
  type CommitOrderBacklogExpectedFailure,
  type CommitOrderBacklogResult,
} from './types.ts';

export const commitOrderBacklogCellDeclaration = defineOperation<
  CommitOrderBacklogCommand,
  CommitOrderBacklogResult,
  CommitOrderBacklogExpectedFailure
>({
  kind: 'command',
  id: commitOrderBacklogOperationId,
  contract: commitOrderBacklogContract,
  authorization: {
    capability: 'production:override',
    timing: 'after-input',
    scope: (input) => input.locationId,
  },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    expectedVersion: (input) => input.previewHash,
  },
  idempotency: { required: true, key: (input) => input.idempotencyKey },
  surfaces: commitOrderBacklogHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.commit_order_backlog' },
});

export const makeCommitOrderBacklogCell = <Stored>(
  dependencies: CommitOrderBacklogDependencies<Stored>,
) =>
  defineOperation(
    commitOrderBacklogCellDeclaration,
    makeExecuteCommitOrderBacklog(dependencies),
  );
