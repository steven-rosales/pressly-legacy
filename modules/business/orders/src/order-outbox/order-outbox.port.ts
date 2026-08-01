import type { FulfillmentDemandChangedEvent } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

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
