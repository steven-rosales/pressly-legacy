import type { AppError } from '@pressly/errors';
import type { CommandContext, Result } from '@pressly/kernel';
import type { OrderMutationResult } from '../command-execution/order-command.port.ts';
import type {
  DirectFulfillmentInput,
  OrderCustomer,
  OrderItemInput,
} from '../order-model/order.model.ts';
import type {
  OrderTransactionPort,
  StoredOrderCommandReceipt,
} from '../persistence/order-transaction.port.ts';

export type IncomingOrderProposalState =
  | 'pending'
  | 'source_closed'
  | 'restored_pending'
  | 'accepted'
  | 'rejected';

export type IncomingOrderProposalEvent =
  | 'accept'
  | 'reject'
  | 'source_close'
  | 'restore';

export type IncomingOrderProposalCustomer = Readonly<{
  externalUserId: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  normalizedPayload: unknown;
}>;

export type IncomingOrderProposalSnapshot = Readonly<{
  customer: IncomingOrderProposalCustomer | null;
  displayNumber: string | null;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: DirectFulfillmentInput;
}>;

export type ProposeIncomingOrderCommand = Readonly<{
  context: CommandContext;
  source: string;
  externalOrderId: string;
  proposalKind: 'submitted_order';
  snapshot: IncomingOrderProposalSnapshot;
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: unknown;
  }>;
}>;

export type IncomingOrderProposalMutationResult = Readonly<{
  proposalId: string | null;
  version: number | null;
  replayed: boolean;
  outcome:
    | 'proposed'
    | 'existing_proposal'
    | 'existing_order'
    | 'source_closed';
}>;

export type ProposeIncomingOrder = (
  command: ProposeIncomingOrderCommand,
) => Promise<Result<IncomingOrderProposalMutationResult, AppError>>;

export type IncomingOrderProposalSummary = Readonly<{
  id: string;
  version: number;
  state: 'pending' | 'source_closed' | 'restored_pending';
  source: string;
  externalOrderId: string;
  locationId: string;
  displayNumber: string | null;
  customer: Readonly<{
    displayName: string | null;
    phone: string | null;
    email: string | null;
  }> | null;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  sourceReportedAt: Date;
  reportedAt: Date;
  sourceClosure: Readonly<{
    kind: 'completed' | 'canceled';
    observedAt: Date;
  }> | null;
  availableActions: readonly IncomingOrderProposalEvent[];
  acceptBlockedReason: 'exact_order_exists' | null;
}>;

export type ListIncomingOrderProposalsQuery = Readonly<{
  locationId: string;
  limit: number;
  cursor: string | null;
  view: 'needs_review' | 'source_closed';
}>;

export type IncomingOrderProposalListResult = Readonly<{
  items: readonly IncomingOrderProposalSummary[];
  nextCursor: string | null;
}>;

export type ListIncomingOrderProposals = (
  query: ListIncomingOrderProposalsQuery,
) => Promise<Result<IncomingOrderProposalListResult, AppError>>;

export type AcceptIncomingOrderProposalReasonCode = 'incoming_order_accepted';
export type RejectIncomingOrderProposalReasonCode =
  | 'already_handled'
  | 'duplicate_order'
  | 'not_pressly_work'
  | 'manager_rejected';

type IncomingOrderProposalDecisionCommand<ReasonCode extends string> =
  Readonly<{
    proposalId: string;
    locationId: string;
    expectedVersion: number;
    idempotencyKey: string;
    context: CommandContext;
    reasonCode: ReasonCode;
    reasonNote: string | null;
  }>;

export type AcceptIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<AcceptIncomingOrderProposalReasonCode>;
export type RejectIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<RejectIncomingOrderProposalReasonCode>;
export type RestoreIncomingOrderProposalCommand =
  IncomingOrderProposalDecisionCommand<'source_closure_overridden'>;

export type IncomingOrderProposalDecisionResult = Readonly<{
  proposalId: string;
  state: 'accepted' | 'rejected';
  version: number;
  orderId: string | null;
  fulfillmentId: string | null;
  replayed: boolean;
}>;

export type AcceptIncomingOrderProposal = (
  command: AcceptIncomingOrderProposalCommand,
) => Promise<Result<IncomingOrderProposalDecisionResult, AppError>>;

export type RejectIncomingOrderProposal = (
  command: RejectIncomingOrderProposalCommand,
) => Promise<Result<IncomingOrderProposalDecisionResult, AppError>>;

export type RestoreIncomingOrderProposalResult = Readonly<{
  proposalId: string;
  state: 'restored_pending';
  version: number;
  replayed: boolean;
}>;

export type RestoreIncomingOrderProposal = (
  command: RestoreIncomingOrderProposalCommand,
) => Promise<Result<RestoreIncomingOrderProposalResult, AppError>>;

export type CloseIncomingOrderSourceCommand = Readonly<{
  context: CommandContext;
  source: string;
  externalOrderId: string;
  terminalCode: 'completed' | 'canceled';
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: string;
    observedAt: Date;
    normalizedPayload: unknown;
  }>;
}>;

export type CloseIncomingOrderSourceResult = Readonly<{
  outcome:
    | 'source_closed'
    | 'tombstoned'
    | 'existing_order'
    | 'already_decided'
    | 'already_source_closed';
  proposalId: string | null;
  version: number | null;
  canonical: Readonly<{
    orderId: string;
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
  replayed: boolean;
}>;

export type CloseIncomingOrderSource = (
  command: CloseIncomingOrderSourceCommand,
) => Promise<Result<CloseIncomingOrderSourceResult, AppError>>;

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
