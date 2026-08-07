import { describe, expect, it } from 'vitest';
import {
  fromSerializedFulfillmentDemandEvent,
  toSerializedFulfillmentDemandEvent,
} from '../../../../../src/foundations/adapters/outbox/fulfillment-demand-codec/fulfillment-demand.contract.mapper.ts';
import { fulfillmentDemandEvent } from '../../../../../src/foundations/language/order-outbox/order-outbox.policy.ts';

const internalEvent = () =>
  fulfillmentDemandEvent({
    fulfillmentId: '00000000-0000-4000-8000-000000000001',
    displayNumber: 'P-100',
    locationId: 'location-1',
    typeCode: 'wash_fold',
    admissionState: 'released',
    commercialState: 'open',
    dueAt: new Date('2026-07-22T12:00:00.000Z'),
    estimatedWeightLbs: 18,
    estimatedWeightSource: 'source_estimate',
    bagCount: null,
    version: 2,
    observedAt: new Date('2026-07-21T12:00:00.000Z'),
  });

const serializedEvent = () => ({
  schemaVersion: 1 as const,
  eventType: 'fulfillment_demand_changed' as const,
  fulfillmentId: '00000000-0000-4000-8000-000000000001',
  displayNumber: 'P-100',
  locationId: 'location-1',
  typeCode: 'wash_fold',
  admissionState: 'released' as const,
  commercialState: 'open' as const,
  dueAt: '2026-07-22T12:00:00.000Z',
  estimatedWeightLbs: 18,
  estimatedWeightSource: 'source_estimate',
  bagCount: null,
  version: 2,
  observedAt: '2026-07-21T12:00:00.000Z',
});

describe('order outbox mapper', () => {
  it('encodes the established versioned event shape at the persistence edge', () => {
    expect(toSerializedFulfillmentDemandEvent(internalEvent())).toEqual(
      serializedEvent(),
    );
  });

  it('decodes trusted timestamps into the module-owned Date model', () => {
    expect(
      fromSerializedFulfillmentDemandEvent({
        eventType: 'fulfillment_demand_changed',
        payload: serializedEvent(),
        fulfillmentId: serializedEvent().fulfillmentId,
        aggregateVersion: 2,
      }),
    ).toEqual({ tag: 'decoded', event: internalEvent() });
  });

  it.each([
    [
      'unsupported event type',
      {
        eventType: 'unknown',
        payload: serializedEvent(),
        fulfillmentId: serializedEvent().fulfillmentId,
        aggregateVersion: 2,
      },
      'unsupported_event_type',
    ],
    [
      'invalid payload',
      {
        eventType: 'fulfillment_demand_changed',
        payload: { ...serializedEvent(), dueAt: 'not-a-date' },
        fulfillmentId: serializedEvent().fulfillmentId,
        aggregateVersion: 2,
      },
      'invalid_payload',
    ],
    [
      'aggregate mismatch',
      {
        eventType: 'fulfillment_demand_changed',
        payload: serializedEvent(),
        fulfillmentId: serializedEvent().fulfillmentId,
        aggregateVersion: 3,
      },
      'aggregate_mismatch',
    ],
  ] as const)(
    'classifies %s without discarding the stored payload',
    (_, input, validationError) => {
      expect(fromSerializedFulfillmentDemandEvent(input)).toEqual({
        tag: 'invalid',
        validationError,
      });
    },
  );
});
