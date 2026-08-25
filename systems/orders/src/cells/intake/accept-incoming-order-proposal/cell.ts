import type { OrderLocationFactsV1Capability } from '@pressly/access-system/capabilities/order-location-facts-v1';
import { bindCell, declareCommandCell } from '@pressly/cells';
import type { ResolveExactSourceCustomerV1Capability } from '@pressly/customers-system/capabilities/resolve-exact-source-customer-v1';
import type { PostgresDatabase } from '@pressly/postgres/client';
import type { Clock } from '@pressly/time';
import { hashOrderCommand } from '../../../model/canonical-order/policy.ts';
import type { IncomingOrderProposalDecisionResult } from '../../../model/incoming-order-proposal/model.ts';
import type { OrdersSchema } from '../../../schema/orders.ts';
import { acceptIncomingOrderProposalContract } from './contract.ts';
import { makeExecuteAcceptIncomingOrderProposal } from './execute.ts';
import { acceptIncomingOrderProposalEmittedMessages } from './events.ts';
import { acceptIncomingOrderProposalHttpSurfaces } from './http.ts';
import { makeAcceptIncomingOrderProposalPostgresWriter } from './postgres.ts';
import type {
  AcceptIncomingOrderProposalCommand,
  AcceptIncomingOrderProposalExpectedFailure,
} from './types.ts';

export const acceptIncomingOrderProposalOperationId =
  'orders.accept-incoming-order-proposal.v1';

export const acceptIncomingOrderProposalCellDeclaration = declareCommandCell<
  AcceptIncomingOrderProposalCommand,
  IncomingOrderProposalDecisionResult,
  AcceptIncomingOrderProposalExpectedFailure
>({
  id: acceptIncomingOrderProposalOperationId,
  authentication: 'required',
  contract: acceptIncomingOrderProposalContract,
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
  surfaces: acceptIncomingOrderProposalHttpSurfaces,
  emits: acceptIncomingOrderProposalEmittedMessages,
  consumes: [],
  observability: { operation: 'orders.accept_incoming_order_proposal' },
});

export const makeAcceptIncomingOrderProposalCell = (dependencies: {
  db: PostgresDatabase;
  schema: OrdersSchema;
  clock: Clock;
  orderLocationFactsV1: OrderLocationFactsV1Capability;
  resolveExactSourceCustomerV1: ResolveExactSourceCustomerV1Capability;
}) =>
  bindCell(
    acceptIncomingOrderProposalCellDeclaration,
    makeExecuteAcceptIncomingOrderProposal({
      writer: makeAcceptIncomingOrderProposalPostgresWriter(dependencies),
    }),
  );
