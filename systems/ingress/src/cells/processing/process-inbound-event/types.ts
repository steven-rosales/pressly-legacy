import type { JsonObject } from '@pressly/codec';

export const processInboundEventOperationId =
  'ingress.process-inbound-event.v1' as const;

export const processInboundEventSystemActorId =
  '00000000-0000-4000-8000-000000000000' as const;

export type ProcessInboundEventResult = Readonly<{
  acknowledged: true;
}>;

export type ProcessInboundEventPermanentFailure = Readonly<{
  kind: 'validation';
  classification: 'missing_consumer' | 'orders' | 'stored_event';
  code: string;
  message: string;
  safeMessage: string;
  status: 400 | 409 | 422;
  retryable: false;
}>;

export type ProcessInboundEventProjectionPendingFailure = Readonly<{
  kind: 'external_service';
  code: 'production_projection_pending';
  message: string;
  safeMessage: string;
  status: 503;
  retryable: true;
}>;

export type ProcessInboundEventExpectedFailure =
  | ProcessInboundEventPermanentFailure
  | ProcessInboundEventProjectionPendingFailure;

export type CapabilityOutcome<Value, Failure> =
  | Readonly<{ kind: 'success'; value: Value }>
  | Readonly<{ kind: 'failure'; failure: Failure }>;

export type ResolveSourceLocationCapability = (query: {
  source: string;
  externalLocationId: string;
}) => Promise<CapabilityOutcome<string | null, never>>;

export type IncomingOrderProposalCustomer = Readonly<{
  externalUserId: string;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
  normalizedPayload: JsonObject;
}>;

export type IncomingOrderProposalItem = Readonly<{
  lineKey: string;
  itemType: 'service';
  code: string;
  description: string;
  quantity: number;
  unit: 'service_unit';
  unitPriceCents: number;
  totalAmountCents: number;
  sourceMetadata: JsonObject;
}>;

export type ProposeIncomingOrderCommand = Readonly<{
  context: Readonly<{
    origin: 'cents';
    principal: Readonly<{ kind: 'system'; id: 'cents-webhook' }>;
  }>;
  source: 'cents';
  externalOrderId: string;
  proposalKind: 'submitted_order';
  revision: Readonly<{
    at: Date;
    hash: string;
    adapterVersion: 'cents-webhook-v3';
    observedAt: Date;
    normalizedPayload: JsonObject;
  }>;
  snapshot: Readonly<{
    customer: IncomingOrderProposalCustomer | null;
    displayNumber: string | null;
    dueAt: Date;
    currency: 'USD';
    totalAmountCents: number;
    balanceDueCents: number | null;
    items: readonly IncomingOrderProposalItem[];
    fulfillment: Readonly<{
      typeCode: 'wash_fold' | 'external_order';
      locationId: string;
      estimatedWeightLbs: number | null;
      estimatedWeightSource: 'source_estimate' | null;
    }>;
  }>;
}>;

export type OrdersInboundFailure =
  | Readonly<{
      kind: 'validation';
      code: string;
      message: string;
      safeMessage?: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'order_idempotency_conflict';
      message: string;
      safeMessage?: string;
    }>;

export type ProposeIncomingOrderCapability = (
  command: ProposeIncomingOrderCommand,
) => Promise<CapabilityOutcome<unknown, OrdersInboundFailure>>;

export type CloseIncomingOrderSourceCommand = Readonly<{
  context: ProposeIncomingOrderCommand['context'];
  source: 'cents';
  externalOrderId: string;
  terminalCode: 'completed' | 'canceled';
  revision: ProposeIncomingOrderCommand['revision'];
}>;

export type CloseIncomingOrderSourceResult = Readonly<{
  canonical: Readonly<{
    orderId: string;
    fulfillmentId: string;
    locationId: string;
    releaseState: 'unreleased' | 'released' | 'withdrawn';
  }> | null;
}>;

export type CloseIncomingOrderSourceCapability = (
  command: CloseIncomingOrderSourceCommand,
) => Promise<
  CapabilityOutcome<CloseIncomingOrderSourceResult, OrdersInboundFailure>
>;

export type ResolveSourceClosedFulfillmentCommand = Readonly<{
  locationId: string;
  fulfillmentId: string;
  actorId: typeof processInboundEventSystemActorId;
  idempotencyKey: string;
}>;

export type ResolveSourceClosedFulfillmentResult = Readonly<{
  outcome: 'already_resolved' | 'not_found' | 'resolved' | 'review_required';
}>;

export type ResolveSourceClosedFulfillmentCapability = (
  command: ResolveSourceClosedFulfillmentCommand,
) => Promise<CapabilityOutcome<ResolveSourceClosedFulfillmentResult, never>>;

export type ProcessInboundEventDependencies = Readonly<{
  resolveSourceLocation: ResolveSourceLocationCapability;
  proposeIncomingOrder: ProposeIncomingOrderCapability;
  closeIncomingOrderSource: CloseIncomingOrderSourceCapability;
  resolveSourceClosedFulfillment: ResolveSourceClosedFulfillmentCapability;
}>;
