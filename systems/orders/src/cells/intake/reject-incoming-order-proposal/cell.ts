import { bindCell, declareCommandCell } from '@pressly/cells';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { rejectIncomingOrderProposalContract } from './contract.ts';
import { makeExecuteRejectIncomingOrderProposal } from './execute.ts';
import { rejectIncomingOrderProposalHttpSurfaces } from './http.ts';
import { makeRejectIncomingOrderProposalPostgresWriter } from './postgres.ts';
import type {
  RejectIncomingOrderProposalCommand,
  RejectIncomingOrderProposalExpectedFailure,
} from './types.ts';

export const rejectIncomingOrderProposalOperationId =
  'orders.reject-incoming-order-proposal.v1';

export const rejectIncomingOrderProposalCellDeclaration = declareCommandCell<
  RejectIncomingOrderProposalCommand,
  IncomingOrderProposalDecisionResult,
  RejectIncomingOrderProposalExpectedFailure
>({
  id: rejectIncomingOrderProposalOperationId,
  authentication: 'required',
  contract: rejectIncomingOrderProposalContract,
  authorization: { capability: 'orders:manage', timing: 'before-input' },
  consistency: {
    transaction: 'required',
    concurrency: 'optimistic',
    concurrencyKey: (input) => input.proposalId,
    expectedVersion: (input) => input.expectedVersion,
  },
  idempotency: {
    required: true,
    key: (input) => input.idempotencyKey,
    fingerprint: hashOrderCommand,
  },
  surfaces: rejectIncomingOrderProposalHttpSurfaces,
  emits: [],
  consumes: [],
  observability: { operation: 'orders.reject_incoming_order_proposal' },
});

export const makeRejectIncomingOrderProposalCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
}) =>
  bindCell(
    rejectIncomingOrderProposalCellDeclaration,
    makeExecuteRejectIncomingOrderProposal({
      writer: makeRejectIncomingOrderProposalPostgresWriter(dependencies),
    }),
  );
