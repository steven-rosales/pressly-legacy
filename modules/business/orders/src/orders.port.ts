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

export type OrderSourceIdentity = Readonly<{
  source: string;
  externalOrderId: string;
}>;

export type OrderSourceRevision = Readonly<{
  at: Date;
  hash: string;
  adapterVersion: string;
  lifecycleCode: string | null;
  observedAt: Date;
  normalizedPayload: unknown;
}>;

export type ObserveOrderSourceCommand = OrderSourceIdentity &
  OrderInput &
  Readonly<{ context: CommandContext; revision: OrderSourceRevision }>;

export type OrderMutationResult = Readonly<{
  orderId: string;
  fulfillmentId: string;
  version: number;
  replayed: boolean;
}>;

export type OrderSourceObservationResult = OrderMutationResult &
  Readonly<{
    outcome: 'created' | 'applied' | 'observed_only' | 'replayed' | 'stale';
  }>;

export type ObserveOrderSource = (
  command: ObserveOrderSourceCommand,
) => Promise<Result<OrderSourceObservationResult, AppError>>;

export type CreateOrderCommand = OrderInput &
  Readonly<{ idempotencyKey: string; context: CommandContext }>;
export type CreateOrder = (
  command: CreateOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type UpdateOrderCommand = Readonly<{
  idempotencyKey: string;
  context: CommandContext;
  locationId: string;
  orderId: string;
  expectedVersion: number;
  changes: Partial<
    Pick<
      OrderInput,
      | 'customer'
      | 'displayNumber'
      | 'state'
      | 'dueAt'
      | 'currency'
      | 'totalAmountCents'
      | 'balanceDueCents'
    >
  >;
}>;
export type UpdateOrder = (
  command: UpdateOrderCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

export type ChangeFulfillmentReleaseCommand = Readonly<{
  idempotencyKey: string;
  context: CommandContext;
  fulfillmentId: string;
  locationId: string;
  expectedVersion: number;
  target: FulfillmentReleaseState;
}>;
export type ChangeFulfillmentRelease = (
  command: ChangeFulfillmentReleaseCommand,
) => Promise<Result<OrderMutationResult, AppError>>;

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
