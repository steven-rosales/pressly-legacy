import { bindCell, declareCommandCell } from '@pressly/cells';
import { freezeBatchMembershipContract } from './contract.ts';
import { freezeBatchMembershipOperationId } from './decide.ts';
import {
  makeExecuteFreezeBatchMembership,
  type FreezeBatchMembershipDependencies,
} from './execute.ts';
import { freezeBatchMembershipHttpSurfaces } from './http.ts';
import type {
  FreezeBatchMembershipCommand,
  FreezeBatchMembershipExpectedFailure,
  FreezeBatchMembershipResult,
} from './types.ts';

export const freezeBatchMembershipCellDeclaration = declareCommandCell<
  FreezeBatchMembershipCommand,
  FreezeBatchMembershipResult,
  FreezeBatchMembershipExpectedFailure
>({
  id: freezeBatchMembershipOperationId,
  contract: freezeBatchMembershipContract,
  authorization: {
    capability: 'production:queue',
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
  surfaces: freezeBatchMembershipHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'production.freeze_batch_membership' },
});

export const makeFreezeBatchMembershipCell = <Stored>(
  deps: FreezeBatchMembershipDependencies<Stored>,
) =>
  bindCell(
    freezeBatchMembershipCellDeclaration,
    makeExecuteFreezeBatchMembership(deps),
  );
