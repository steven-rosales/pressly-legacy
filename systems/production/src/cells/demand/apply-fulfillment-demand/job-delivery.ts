import { sha256Text } from '@pressly/codec/node';
import type { DurableJobFailure } from '@pressly/jobs';
import type {
  ClaimedOrderOutboxEvent,
  FulfillmentDemandChangedEvent,
  OrderOutboxDurableJobDelivery,
} from '@pressly/orders-system/capabilities/order-outbox-job';
import type { ApplyFulfillmentDemandCommand } from './types.ts';

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
  idempotencyKey: `order-outbox:${input.eventId}`,
});

const invalidDeliveryFailure = (
  event: Extract<ClaimedOrderOutboxEvent, { kind: 'invalid' }>,
): DurableJobFailure => ({
  code: `order_outbox_${event.validationError}`,
  message: 'The order outbox event is outside its durable contract.',
  retryable: false,
  category: 'invariant',
  status: 500,
});

export const toOrderOutboxDurableJobDelivery = (
  event: ClaimedOrderOutboxEvent,
): OrderOutboxDurableJobDelivery => {
  const delivery = {
    id: event.id,
    attempt: event.attempts,
    receipt: Object.freeze({
      eventId: event.id,
      workerId: event.leaseOwner,
    }),
  };

  if (event.kind === 'invalid')
    return Object.freeze({
      ...delivery,
      resolution: Object.freeze({
        kind: 'reject' as const,
        failure: Object.freeze(invalidDeliveryFailure(event)),
      }),
    });

  if (event.payload.typeCode !== 'wash_fold')
    return Object.freeze({
      ...delivery,
      resolution: Object.freeze({
        kind: 'complete-without-invoke' as const,
      }),
    });

  return Object.freeze({
    ...delivery,
    resolution: Object.freeze({
      kind: 'invoke' as const,
      payload: Object.freeze(
        toApplyFulfillmentDemandCommand({
          eventId: event.id,
          demand: event.payload,
        }),
      ),
    }),
  });
};
