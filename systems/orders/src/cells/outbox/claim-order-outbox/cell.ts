import { defineOperation } from '@pressly/cells';
import { claimOrderOutboxContract } from './contract.ts';
import {
  makeExecuteClaimOrderOutbox,
  type ClaimOrderOutboxDependencies,
} from './execute.ts';
import {
  claimOrderOutboxOperationId,
  type ClaimOrderOutboxCommand,
  type ClaimOrderOutboxExpectedFailure,
  type ClaimOrderOutboxResult,
} from './types.ts';

export const claimOrderOutboxCellDeclaration = defineOperation<
  ClaimOrderOutboxCommand,
  ClaimOrderOutboxResult,
  ClaimOrderOutboxExpectedFailure
>({
  kind: 'command',
  id: claimOrderOutboxOperationId,
  authentication: 'none',
  contract: claimOrderOutboxContract,
  consistency: { transaction: 'required', concurrency: 'none' },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'orders.claim_order_outbox' },
});

export const makeClaimOrderOutboxCell = (
  dependencies: ClaimOrderOutboxDependencies,
) =>
  defineOperation(
    claimOrderOutboxCellDeclaration,
    makeExecuteClaimOrderOutbox(dependencies),
  );
