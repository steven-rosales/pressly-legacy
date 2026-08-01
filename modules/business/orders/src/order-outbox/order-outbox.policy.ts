import {
  fulfillmentDemandChangedEventSchema,
  fulfillmentDemandChangedEventType,
  type FulfillmentDemandChangedEvent,
} from '@pressly/contracts';
import type {
  FulfillmentReleaseState,
  OrderState,
} from '../order-model/order-model.port.ts';

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
}): FulfillmentDemandChangedEvent =>
  fulfillmentDemandChangedEventSchema.parse({
    schemaVersion: 1,
    eventType: fulfillmentDemandChangedEventType,
    fulfillmentId: input.fulfillmentId,
    displayNumber: input.displayNumber,
    locationId: input.locationId,
    typeCode: input.typeCode,
    admissionState: input.admissionState,
    commercialState: input.commercialState,
    dueAt: input.dueAt.toISOString(),
    estimatedWeightLbs: input.estimatedWeightLbs,
    estimatedWeightSource: input.estimatedWeightSource,
    bagCount: input.bagCount,
    version: input.version,
    observedAt: input.observedAt.toISOString(),
  });
