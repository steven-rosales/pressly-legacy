import {
  fulfillmentDemandChangedEventSchema,
  fulfillmentDemandChangedEventType as serializedFulfillmentDemandChangedEventType,
  type FulfillmentDemandChangedEvent as SerializedFulfillmentDemandChangedEvent,
} from '@pressly/contracts/orders';
import type {
  FulfillmentDemandChangedEvent,
  OrderOutboxValidationError,
} from '../../../language/order-outbox/order-outbox.model.ts';

export type FulfillmentDemandEventDecodeResult =
  | Readonly<{
      tag: 'decoded';
      event: FulfillmentDemandChangedEvent;
    }>
  | Readonly<{
      tag: 'invalid';
      validationError: OrderOutboxValidationError;
    }>;

export const toSerializedFulfillmentDemandEvent = (
  event: FulfillmentDemandChangedEvent,
): SerializedFulfillmentDemandChangedEvent =>
  fulfillmentDemandChangedEventSchema.parse({
    schemaVersion: event.schemaVersion,
    eventType: event.eventType,
    fulfillmentId: event.fulfillmentId,
    displayNumber: event.displayNumber,
    locationId: event.locationId,
    typeCode: event.typeCode,
    admissionState: event.admissionState,
    commercialState: event.commercialState,
    dueAt: event.dueAt.toISOString(),
    estimatedWeightLbs: event.estimatedWeightLbs,
    estimatedWeightSource: event.estimatedWeightSource,
    bagCount: event.bagCount,
    version: event.version,
    observedAt: event.observedAt.toISOString(),
  });

export const fromSerializedFulfillmentDemandEvent = (input: {
  eventType: string;
  payload: JsonValue;
  fulfillmentId: string;
  aggregateVersion: number;
}): FulfillmentDemandEventDecodeResult => {
  if (input.eventType !== serializedFulfillmentDemandChangedEventType)
    return {
      tag: 'invalid',
      validationError: 'unsupported_event_type',
    };

  const parsed = fulfillmentDemandChangedEventSchema.safeParse(input.payload);
  if (!parsed.success)
    return {
      tag: 'invalid',
      validationError: 'invalid_payload',
    };

  if (
    parsed.data.fulfillmentId !== input.fulfillmentId ||
    parsed.data.version !== input.aggregateVersion
  )
    return {
      tag: 'invalid',
      validationError: 'aggregate_mismatch',
    };

  return {
    tag: 'decoded',
    event: {
      schemaVersion: parsed.data.schemaVersion,
      eventType: parsed.data.eventType,
      fulfillmentId: parsed.data.fulfillmentId,
      displayNumber: parsed.data.displayNumber,
      locationId: parsed.data.locationId,
      typeCode: parsed.data.typeCode,
      admissionState: parsed.data.admissionState,
      commercialState: parsed.data.commercialState,
      dueAt: new Date(parsed.data.dueAt),
      estimatedWeightLbs: parsed.data.estimatedWeightLbs,
      estimatedWeightSource: parsed.data.estimatedWeightSource,
      bagCount: parsed.data.bagCount,
      version: parsed.data.version,
      observedAt: new Date(parsed.data.observedAt),
    },
  };
};
import type { JsonValue } from '@pressly/codec';
