import { bindCell, declareCommandCell } from '@pressly/cells';
import { unfreezeBatchMembershipContract } from './contract.ts';
import { unfreezeBatchMembershipOperationId } from './decide.ts';
import {
  makeExecuteUnfreezeBatchMembership,
  type UnfreezeBatchMembershipDependencies,
} from './execute.ts';
import { unfreezeBatchMembershipHttpSurfaces } from './http.ts';
import type {
  UnfreezeBatchMembershipCommand,
  UnfreezeBatchMembershipExpectedFailure,
  UnfreezeBatchMembershipResult,
} from './types.ts';

export const unfreezeBatchMembershipCellDeclaration = declareCommandCell<
  UnfreezeBatchMembershipCommand,
  UnfreezeBatchMembershipResult,
  UnfreezeBatchMembershipExpectedFailure
>({
  id: unfreezeBatchMembershipOperationId,
  contract: unfreezeBatchMembershipContract,
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
  surfaces: unfreezeBatchMembershipHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.unfreeze_batch_membership' },
});

export const makeUnfreezeBatchMembershipCell = <Stored>(
  deps: UnfreezeBatchMembershipDependencies<Stored>,
) =>
  bindCell(
    unfreezeBatchMembershipCellDeclaration,
    makeExecuteUnfreezeBatchMembership(deps),
  );
