import { sha256Text } from '@pressly/codec/node';
import type { FulfillmentDemandChangedEvent } from '@pressly/orders';
import type { ApplyFulfillmentDemandCommand } from '@pressly/production';

type ProjectionHashValue = string | number | null;

const serializedDemandValues = (
  demand: FulfillmentDemandChangedEvent,
): readonly ProjectionHashValue[] => [
  demand.fulfillmentId,
  demand.displayNumber,
  demand.locationId,
  demand.typeCode,
  demand.admissionState,
  demand.commercialState,
  demand.dueAt.toISOString(),
  demand.estimatedWeightLbs,
  demand.estimatedWeightSource,
  demand.bagCount,
  demand.version,
  demand.observedAt.toISOString(),
];

export const fulfillmentDemandProjectionHash = (
  demand: FulfillmentDemandChangedEvent,
): string => sha256Text(JSON.stringify(serializedDemandValues(demand)));

export const toApplyFulfillmentDemandCommand = (input: {
  eventId: string;
  demand: FulfillmentDemandChangedEvent;
}): ApplyFulfillmentDemandCommand => ({
  fulfillmentId: input.demand.fulfillmentId,
  fulfillmentVersion: input.demand.version,
  projectionHash: fulfillmentDemandProjectionHash(input.demand),
  displayReference: input.demand.displayNumber,
  locationId: input.demand.locationId,
  admissionState: input.demand.admissionState,
  commercialState: input.demand.commercialState,
  dueAt: input.demand.dueAt.toISOString(),
  observedAt: input.demand.observedAt.toISOString(),
  estimatedWeightLbs: input.demand.estimatedWeightLbs,
  estimatedWeightSource:
    input.demand.estimatedWeightLbs === null ? null : 'external_estimate',
  bagCount: input.demand.bagCount,
  idempotencyKey: `order-outbox:${input.eventId}`,
});
