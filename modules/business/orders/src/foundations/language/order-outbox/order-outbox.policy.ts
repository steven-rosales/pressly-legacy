import type {
  FulfillmentReleaseState,
  OrderState,
} from '../order/order.model.ts';
import {
  fulfillmentDemandChangedEventType,
  type FulfillmentDemandChangedEvent,
} from './order-outbox.model.ts';

export const fulfillmentDemandEvent = (input: {
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
}): FulfillmentDemandChangedEvent => ({
  schemaVersion: 1,
  eventType: fulfillmentDemandChangedEventType,
  fulfillmentId: input.fulfillmentId,
  displayNumber: input.displayNumber,
  locationId: input.locationId,
  typeCode: input.typeCode,
  admissionState: input.admissionState,
  commercialState: input.commercialState,
  dueAt: input.dueAt,
  estimatedWeightLbs: input.estimatedWeightLbs,
  estimatedWeightSource: input.estimatedWeightSource,
  bagCount: input.bagCount,
  version: input.version,
  observedAt: input.observedAt,
});
