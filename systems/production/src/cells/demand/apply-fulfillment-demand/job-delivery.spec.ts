import type { ClaimedOrderOutboxEvent } from '@pressly/orders-system/capabilities/order-outbox-job';
import { describe, expect, it } from 'vitest';
import {
  fulfillmentDemandProjectionHash,
  toApplyFulfillmentDemandCommand,
  toOrderOutboxDurableJobDelivery,
} from './job-delivery.ts';

const event = (
  overrides: Partial<
    Extract<ClaimedOrderOutboxEvent, { kind: 'fulfillment_demand_changed' }>
  > = {},
): Extract<
  ClaimedOrderOutboxEvent,
  { kind: 'fulfillment_demand_changed' }
> => ({
  id: '00000000-0000-4000-8000-000000000001',
  orderId: '00000000-0000-4000-8000-000000000002',
  fulfillmentId: '00000000-0000-4000-8000-000000000003',
  aggregateVersion: 2,
  attempts: 1,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date('2026-08-22T16:00:30.000Z'),
  kind: 'fulfillment_demand_changed',
  eventType: 'fulfillment_demand_changed',
  payload: {
    schemaVersion: 2,
    eventType: 'fulfillment_demand_changed',
    fulfillmentId: '00000000-0000-4000-8000-000000000003',
    displayNumber: 'P-1042',
    locationId: 'location-1',
    typeCode: 'wash_fold',
    admissionState: 'released',
    commercialState: 'completed',
    dueAt: new Date('2026-07-22T20:00:00.000Z'),
    estimatedWeightLbs: 42,
    estimatedWeightSource: 'source_estimate',
    version: 2,
    observedAt: new Date('2026-07-21T14:00:00.000Z'),
  },
  ...overrides,
});

describe('Order outbox fulfillment-demand delivery', () => {
  it('hashes and maps the exact v2 demand', () => {
    expect(fulfillmentDemandProjectionHash(event().payload)).toBe(
      '62498a63b492f92cf0a9c1e2dafe509a05c5517b4aa830c83a99da8c9237e3a3',
    );
    expect(
      toApplyFulfillmentDemandCommand({
        eventId: event().id,
        demand: event().payload,
      }),
    ).toEqual({
      fulfillmentId: event().fulfillmentId,
      fulfillmentVersion: 2,
      projectionHash:
        '62498a63b492f92cf0a9c1e2dafe509a05c5517b4aa830c83a99da8c9237e3a3',
      displayReference: 'P-1042',
      locationId: 'location-1',
      admissionState: 'released',
      commercialState: 'completed',
      dueAt: '2026-07-22T20:00:00.000Z',
      observedAt: '2026-07-21T14:00:00.000Z',
      estimatedWeightLbs: 42,
      estimatedWeightSource: 'external_estimate',
      idempotencyKey: `order-outbox:${event().id}`,
    });
  });

  it('invokes the target reaction only for wash_fold demand', () => {
    expect(toOrderOutboxDurableJobDelivery(event())).toEqual({
      id: event().id,
      attempt: 1,
      receipt: { eventId: event().id, workerId: 'worker-1' },
      resolution: {
        kind: 'invoke',
        payload: expect.objectContaining({
          fulfillmentId: event().fulfillmentId,
          idempotencyKey: `order-outbox:${event().id}`,
        }),
      },
    });
  });

  it('completes a non-wash-fold event without invoking Production', () => {
    const commercial = event({
      payload: { ...event().payload, typeCode: 'dry_cleaning' },
    });
    expect(toOrderOutboxDurableJobDelivery(commercial)).toMatchObject({
      resolution: { kind: 'complete-without-invoke' },
    });
  });

  it.each([
    'unsupported_event_type',
    'invalid_payload',
    'aggregate_mismatch',
  ] as const)(
    'rejects %s with the deployed permanent failure',
    (validationError) => {
      const invalid: ClaimedOrderOutboxEvent = {
        id: event().id,
        orderId: event().orderId,
        fulfillmentId: event().fulfillmentId,
        aggregateVersion: 2,
        attempts: 8,
        leaseOwner: 'worker-1',
        leaseExpiresAt: event().leaseExpiresAt,
        kind: 'invalid',
        eventType: 'unknown',
        payload: {},
        validationError,
      };
      expect(toOrderOutboxDurableJobDelivery(invalid)).toEqual({
        id: invalid.id,
        attempt: 8,
        receipt: { eventId: invalid.id, workerId: 'worker-1' },
        resolution: {
          kind: 'reject',
          failure: {
            code: `order_outbox_${validationError}`,
            message: 'The order outbox event is outside its durable contract.',
            retryable: false,
            category: 'invariant',
            status: 500,
          },
        },
      });
    },
  );

  it('normalizes any weighted producer provenance', () => {
    const weighted = event({
      payload: {
        ...event().payload,
        estimatedWeightSource: 'manual_source_value',
      },
    });
    const delivery = toOrderOutboxDurableJobDelivery(weighted);
    expect(delivery.resolution).toMatchObject({
      kind: 'invoke',
      payload: {
        estimatedWeightSource: 'external_estimate',
      },
    });
  });
});
