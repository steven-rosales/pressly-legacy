import type { JsonValue } from '@pressly/codec';
import type {
  FulfillmentReleaseState,
  OrderState,
} from '../order/order.model.ts';

export const fulfillmentDemandChangedEventType =
  'fulfillment_demand_changed' as const;

export type FulfillmentDemandChangedEvent = Readonly<{
  schemaVersion: 1;
  eventType: typeof fulfillmentDemandChangedEventType;
  fulfillmentId: string;
  displayNumber: string | null;
  locationId: string;
  typeCode: string;
  admissionState: FulfillmentReleaseState;
  commercialState: OrderState;
  dueAt: Date;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  bagCount: number | null;
  version: number;
  observedAt: Date;
}>;

type OrderOutboxEventBase = Readonly<{
  id: string;
  orderId: string;
  fulfillmentId: string;
  aggregateVersion: number;
  attempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}>;

export type OrderOutboxValidationError =
  | 'unsupported_event_type'
  | 'invalid_payload'
  | 'aggregate_mismatch';

export type OrderOutboxEvent = OrderOutboxEventBase &
  (
    | Readonly<{
        kind: 'fulfillment_demand_changed';
        eventType: typeof fulfillmentDemandChangedEventType;
        payload: FulfillmentDemandChangedEvent;
      }>
    | Readonly<{
        kind: 'invalid';
        eventType: string;
        payload: JsonValue;
        validationError: OrderOutboxValidationError;
      }>
  );

export type ClaimOrderOutboxCommand = Readonly<{
  workerId: string;
  limit: number;
  leaseMs: number;
}>;

export type CompleteOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
}>;

export type RetryOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
  availableAt: Date;
  errorCode: string;
  errorMessage: string;
}>;

export type DeadLetterOrderOutboxCommand = Readonly<{
  eventId: string;
  workerId: string;
  errorCode: string;
  errorMessage: string;
}>;
