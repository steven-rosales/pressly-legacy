import type { AppError } from '@pressly/errors';
import type { CommandContext, Result } from '@pressly/kernel';
import type { FulfillmentDemandChangedEvent } from '@pressly/contracts';

export type OrderState = 'open' | 'completed' | 'canceled';
export type FulfillmentReleaseState = 'unreleased' | 'released' | 'withdrawn';

export type OrderCustomer =
  | Readonly<{
      resolution: 'resolved';
      userId: string;
      externalUserId: string | null;
    }>
  | Readonly<{
      resolution: 'not_provided';
      userId: null;
      externalUserId: null;
    }>
  | Readonly<{
      resolution: 'pending' | 'conflict';
      userId: null;
      externalUserId: string;
    }>
  | Readonly<{
      resolution: 'legacy_unknown';
      userId: null;
      externalUserId: string | null;
    }>;

export type OrderItemInput = Readonly<{
  lineKey: string;
  itemType: string;
  code: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: unknown;
}>;

export type FulfillmentInput = Readonly<{
  typeCode: string;
  locationId: string;
  releaseState: FulfillmentReleaseState;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  bagCount: number | null;
}>;

export type OrderInput = Readonly<{
  customer: OrderCustomer;
  displayNumber: string | null;
  state: OrderState;
  dueAt: Date;
  currency: string;
  totalAmountCents: number;
  balanceDueCents: number | null;
  items: readonly OrderItemInput[];
  fulfillment: FulfillmentInput;
}>;

export type DirectFulfillmentInput = Omit<
  FulfillmentInput,
  'releaseState' | 'bagCount'
>;

/**
 * Descriptive facts accepted when Pressly creates a canonical Order.
 *
 * Commercial lifecycle, production admission, and physical intake are absent
 * by construction. The application owns their initial canonical values.
 */
export type DirectOrderInput = Omit<OrderInput, 'state' | 'fulfillment'> &
  Readonly<{ fulfillment: DirectFulfillmentInput }>;

export type OrderMutationResult = Readonly<{
  orderId: string;
  fulfillmentId: string;
  version: number;
  replayed: boolean;
}>;

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

type AuditedOrderCommand<ReasonCode extends string> = Readonly<{
  idempotencyKey: string;
  context: CommandContext;
  reasonCode: ReasonCode;
  reasonNote: string | null;
}>;

export type CreateOrderReasonCode = 'new_customer_order' | 'recovery_entry';
export type CorrectOrderReasonCode =
  | 'customer_correction'
  | 'manager_correction'
  | 'source_discrepancy';
export type CompleteOrderReasonCode =
  | 'service_completed'
  | 'manager_correction';
export type CancelOrderReasonCode =
  | 'customer_canceled'
  | 'duplicate_order'
  | 'created_in_error'
  | 'manager_correction';
export type ReleaseFulfillmentReasonCode =
  | 'ready_for_production'
  | 'manager_override';
export type WithdrawFulfillmentReasonCode =
  | 'commercial_canceled'
  | 'production_hold'
  | 'manager_override';
export type CreateOrderCommand = DirectOrderInput &
  AuditedOrderCommand<CreateOrderReasonCode>;
export type CreateOrder = (
  command: CreateOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type FulfillmentDescriptionCorrection = Readonly<{
  typeCode?: string;
  /**
   * The use case does not permit moving an aggregate outside the command's
   * authorized location scope.
   */
  locationId?: string;
  estimatedWeight?: Readonly<{
    lbs: number | null;
    source: string | null;
  }>;
}>;

export type OrderDescriptionCorrection = Partial<
  Pick<
    OrderInput,
    | 'customer'
    | 'displayNumber'
    | 'dueAt'
    | 'currency'
    | 'totalAmountCents'
    | 'balanceDueCents'
    | 'items'
  >
> &
  Readonly<{ fulfillment?: FulfillmentDescriptionCorrection }>;

export type CorrectOrderCommand = AuditedOrderCommand<CorrectOrderReasonCode> &
  Readonly<{
    locationId: string;
    orderId: string;
    expectedOrderVersion: number;
    expectedFulfillmentVersion: number;
    changes: OrderDescriptionCorrection;
  }>;
export type CorrectOrder = (
  command: CorrectOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

type OrderLifecycleCommand<ReasonCode extends string> =
  AuditedOrderCommand<ReasonCode> &
    Readonly<{
      locationId: string;
      orderId: string;
      expectedVersion: number;
    }>;

export type CompleteOrderCommand =
  OrderLifecycleCommand<CompleteOrderReasonCode>;
export type CompleteOrder = (
  command: CompleteOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type CancelOrderCommand = OrderLifecycleCommand<CancelOrderReasonCode>;
export type CancelOrder = (
  command: CancelOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

type FulfillmentReleaseCommand<ReasonCode extends string> =
  AuditedOrderCommand<ReasonCode> &
    Readonly<{
      fulfillmentId: string;
      locationId: string;
      expectedOrderVersion: number;
      expectedFulfillmentVersion: number;
    }>;

export type ReleaseFulfillmentCommand =
  FulfillmentReleaseCommand<ReleaseFulfillmentReasonCode>;
export type ReleaseFulfillment = (
  command: ReleaseFulfillmentCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type WithdrawFulfillmentCommand =
  FulfillmentReleaseCommand<WithdrawFulfillmentReasonCode>;
export type WithdrawFulfillment = (
  command: WithdrawFulfillmentCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

/*
 * Canonical lifecycle and release commands intentionally have distinct
 * public types. A first-party caller cannot smuggle a target state through a
 * generic update payload.
 */
export type CanonicalOrderCommand =
  | CreateOrderCommand
  | CorrectOrderCommand
  | CompleteOrderCommand
  | CancelOrderCommand
  | ReleaseFulfillmentCommand
  | WithdrawFulfillmentCommand;

export type OrderClockPort = Readonly<{ now: () => Date }>;

type OrderOutboxEventBase = Readonly<{
  id: string;
  orderId: string;
  fulfillmentId: string;
  aggregateVersion: number;
  attempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}>;

export type OrderOutboxEvent = OrderOutboxEventBase &
  (
    | Readonly<{
        kind: 'fulfillment_demand_changed';
        eventType: 'fulfillment_demand_changed';
        payload: FulfillmentDemandChangedEvent;
      }>
    | Readonly<{
        kind: 'invalid';
        eventType: string;
        payload: unknown;
        validationError:
          | 'unsupported_event_type'
          | 'invalid_payload'
          | 'aggregate_mismatch';
      }>
  );

export type ClaimOrderOutboxCommand = Readonly<{
  workerId: string;
  limit: number;
  leaseMs: number;
}>;
export type ClaimOrderOutbox = (
  command: ClaimOrderOutboxCommand,
) => Promise<Result<readonly OrderOutboxEvent[], AppError>>;

export type CompleteOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
}>;
export type CompleteOrderOutbox = (
  command: CompleteOrderOutboxCommand,
) => Promise<Result<Readonly<{ completed: boolean }>, AppError>>;

export type RetryOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
  availableAt: Date;
  errorCode: string;
  errorMessage: string;
}>;
export type RetryOrderOutbox = (
  command: RetryOrderOutboxCommand,
) => Promise<Result<Readonly<{ retried: boolean }>, AppError>>;

export type DeadLetterOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
  errorCode: string;
  errorMessage: string;
}>;
export type DeadLetterOrderOutbox = (
  command: DeadLetterOrderOutboxCommand,
) => Promise<Result<Readonly<{ deadLettered: boolean }>, AppError>>;
