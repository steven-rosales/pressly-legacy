import type { CommandContext } from '@pressly/kernel';
import type {
  OrderTransactionPort,
  StoredOrderCommandReceipt,
} from '../order-transaction.port.ts';
import type {
  IncomingOrderProposalDecisionResult,
  IncomingOrderProposalEvent,
  IncomingOrderProposalListResult,
  IncomingOrderProposalSnapshot,
  IncomingOrderProposalState,
  CloseIncomingOrderSourceCommand,
  CloseIncomingOrderSourceResult,
  OrderCustomer,
  OrderMutationResult,
  ProposeIncomingOrderCommand,
  RestoreIncomingOrderProposalResult,
} from '../orders.port.ts';

export type StoredIncomingOrderProposalResolution = Readonly<{
  decision: 'accepted' | 'rejected';
  proposalVersion: number;
  orderId: string | null;
  fulfillmentId: string | null;
  idempotencyKey: string;
  commandHash: string;
}>;

export type StoredIncomingOrderProposal = Readonly<{
  id: string;
  source: string;
  externalOrderId: string;
  locationId: string;
  proposalKind: 'pickup' | 'submitted_order';
  sourceRevisionAt: Date;
  sourceRevisionHash: string;
  adapterVersion: string;
  sourceNormalizedPayload: unknown;
  snapshot: IncomingOrderProposalSnapshot;
  observedAt: Date;
  state: IncomingOrderProposalState;
  version: number;
  resolution: StoredIncomingOrderProposalResolution | null;
  sourceClosure: Readonly<{
    kind: 'completed' | 'canceled';
    observedAt: Date;
  }> | null;
}>;

export type IncomingOrderProposalResolutionInput = Readonly<{
  proposal: StoredIncomingOrderProposal;
  idempotencyKey: string;
  commandHash: string;
  context: Readonly<{
    origin: string;
    principal: Readonly<{ kind: 'human' | 'service' | 'system'; id: string }>;
  }>;
  reasonCode: string;
  reasonNote: string | null;
  decidedAt: Date;
  transition: Readonly<{
    from: 'pending' | 'restored_pending';
    to: 'accepted' | 'rejected';
    event: 'accept' | 'reject';
    version: number;
  }>;
}>;

export type AcceptIncomingOrderProposalInput =
  IncomingOrderProposalResolutionInput &
    Readonly<{
      customer: OrderCustomer;
      canonical: Readonly<{
        state: 'open';
        releaseState: 'unreleased';
      }>;
    }>;

export type StoredIncomingOrderSourceTombstone = Readonly<{
  source: string;
  externalOrderId: string;
  proposalId: string | null;
  terminalCode: 'completed' | 'canceled';
  sourceRevisionAt: Date;
  sourceRevisionHash: string;
  observedAt: Date;
}>;

export type ExactCanonicalOrder = Readonly<{
  orderId: string;
  fulfillment: Readonly<{
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
}>;

export type ProposeIncomingOrderOperations = Readonly<{
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  findExactOrder: (
    source: string,
    externalOrderId: string,
  ) => Promise<ExactCanonicalOrder | null>;
  findTombstone: (
    source: string,
    externalOrderId: string,
  ) => Promise<StoredIncomingOrderSourceTombstone | null>;
  findProposal: (
    source: string,
    externalOrderId: string,
  ) => Promise<StoredIncomingOrderProposal | null>;
  createProposal: (
    command: ProposeIncomingOrderCommand,
  ) => Promise<Readonly<{ proposalId: string }>>;
}>;

export type DecideIncomingOrderProposalOperations = Readonly<{
  lockCommand: (idempotencyKey: string) => Promise<void>;
  loadResolutionByIdempotencyKey: (
    idempotencyKey: string,
  ) => Promise<
    | (StoredIncomingOrderProposalResolution & Readonly<{ proposalId: string }>)
    | null
  >;
  loadCanonicalOrderCommandReceipt: (
    idempotencyKey: string,
  ) => Promise<StoredOrderCommandReceipt | null>;
  loadProposal: (
    proposalId: string,
  ) => Promise<StoredIncomingOrderProposal | null>;
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  lockProposal: (proposalId: string) => Promise<void>;
  findExactOrder: (
    source: string,
    externalOrderId: string,
  ) => Promise<ExactCanonicalOrder | null>;
  loadTransitionByIdempotencyKey: (idempotencyKey: string) => Promise<Readonly<{
    proposalId: string;
    from: IncomingOrderProposalState;
    to: IncomingOrderProposalState;
    event: IncomingOrderProposalEvent;
    proposalVersion: number;
    commandHash: string;
  }> | null>;
  resolveOrCreateExactCustomer: (
    proposal: StoredIncomingOrderProposal,
    now: Date,
    context: CommandContext,
  ) => Promise<OrderCustomer>;
  acceptProposal: (
    input: AcceptIncomingOrderProposalInput,
  ) => Promise<OrderMutationResult>;
  rejectProposal: (
    input: IncomingOrderProposalResolutionInput,
  ) => Promise<void>;
  restoreProposal: (input: {
    proposal: StoredIncomingOrderProposal;
    idempotencyKey: string;
    commandHash: string;
    context: IncomingOrderProposalResolutionInput['context'];
    reasonCode: 'source_closure_overridden';
    reasonNote: string | null;
    restoredAt: Date;
    transition: Readonly<{
      from: 'source_closed';
      to: 'restored_pending';
      event: 'restore';
      version: number;
    }>;
  }) => Promise<RestoreIncomingOrderProposalResult>;
}>;

export type CloseIncomingOrderSourceOperations = Readonly<{
  lockSource: (source: string, externalOrderId: string) => Promise<void>;
  findExactOrder: (
    source: string,
    externalOrderId: string,
  ) => Promise<ExactCanonicalOrder | null>;
  findProposal: (
    source: string,
    externalOrderId: string,
  ) => Promise<StoredIncomingOrderProposal | null>;
  lockProposal: (proposalId: string) => Promise<void>;
  findTombstone: (
    source: string,
    externalOrderId: string,
  ) => Promise<StoredIncomingOrderSourceTombstone | null>;
  createTombstone: (
    command: CloseIncomingOrderSourceCommand,
    proposalId: string | null,
  ) => Promise<StoredIncomingOrderSourceTombstone>;
  closeProposal: (input: {
    proposal: StoredIncomingOrderProposal;
    command: CloseIncomingOrderSourceCommand;
    idempotencyKey: string;
    commandHash: string;
    closedAt: Date;
    transition: Readonly<{
      from: 'pending';
      to: 'source_closed';
      event: 'source_close';
      version: number;
    }>;
  }) => Promise<CloseIncomingOrderSourceResult>;
}>;

export type ProposeIncomingOrderRepository =
  OrderTransactionPort<ProposeIncomingOrderOperations>;

export type DecideIncomingOrderProposalRepository =
  OrderTransactionPort<DecideIncomingOrderProposalOperations>;

export type CloseIncomingOrderSourceRepository =
  OrderTransactionPort<CloseIncomingOrderSourceOperations>;

export type ListIncomingOrderProposalsRepository = Readonly<{
  listPending: (query: {
    locationId: string;
    limit: number;
    cursor: string | null;
    view: 'needs_review' | 'source_closed';
  }) => Promise<
    | Readonly<{
        kind: 'ok';
        value: IncomingOrderProposalListResult;
      }>
    | Readonly<{ kind: 'invalid_cursor' }>
  >;
}>;

export const decisionResultFromResolution = (
  proposalId: string,
  resolution: StoredIncomingOrderProposalResolution,
  replayed: boolean,
): IncomingOrderProposalDecisionResult => ({
  proposalId,
  state: resolution.decision,
  version: resolution.proposalVersion,
  orderId: resolution.orderId,
  fulfillmentId: resolution.fulfillmentId,
  replayed,
});
