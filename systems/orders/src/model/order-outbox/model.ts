import type { JsonValue } from '@pressly/codec';

export type FulfillmentDemandChangedEvent = Readonly<{
  schemaVersion: 2;
  eventType: 'fulfillment_demand_changed';
  fulfillmentId: string;
  displayNumber: string | null;
  locationId: string;
  typeCode: string;
  admissionState: 'unreleased' | 'released' | 'withdrawn';
  commercialState: 'open' | 'completed' | 'canceled';
  dueAt: Date;
  estimatedWeightLbs: number | null;
  estimatedWeightSource: string | null;
  version: number;
  observedAt: Date;
}>;

export type OrderOutboxValidationError =
  | 'unsupported_event_type'
  | 'invalid_payload'
  | 'aggregate_mismatch';

export type ClaimedOrderOutboxEvent = Readonly<{
  id: string;
  orderId: string;
  fulfillmentId: string;
  aggregateVersion: number;
  attempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
}> &
  (
    | Readonly<{
        kind: 'fulfillment_demand_changed';
        eventType: 'fulfillment_demand_changed';
        payload: FulfillmentDemandChangedEvent;
      }>
    | Readonly<{
        kind: 'invalid';
        eventType: string;
        payload: JsonValue;
        validationError: OrderOutboxValidationError;
      }>
  );

export type OrderOutboxBacklog = Readonly<{
  pendingCount: number;
  oldestPendingAgeSeconds: number;
}>;
