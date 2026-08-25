import { bindCell, declareCommandCell } from '@pressly/cells';
import { claimEventsContract } from './contract.ts';
import {
  makeExecuteClaimEvents,
  type ClaimEventsDependencies,
} from './execute.ts';
import {
  claimEventsOperationId,
  type ClaimEventsCommand,
  type ClaimEventsExpectedFailure,
  type ClaimEventsResult,
} from './types.ts';

export const claimEventsCellDeclaration = declareCommandCell<
  ClaimEventsCommand,
  ClaimEventsResult,
  ClaimEventsExpectedFailure
>({
  id: claimEventsOperationId,
  authentication: 'none',
  contract: claimEventsContract,
  consistency: { transaction: 'required', concurrency: 'partitioned' },
  idempotency: { required: false },
  surfaces: [],
  emits: [],
  consumes: [],
  observability: { operation: 'ingress.claim_events' },
});

export const makeClaimEventsCell = (deps: ClaimEventsDependencies) =>
  bindCell(claimEventsCellDeclaration, makeExecuteClaimEvents(deps));
