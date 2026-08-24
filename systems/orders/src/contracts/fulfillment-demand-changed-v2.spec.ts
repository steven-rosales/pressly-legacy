import { describe, expect, it } from 'vitest';
import {
  fulfillmentDemandChangedV2MessageContract,
  fulfillmentDemandChangedV2PayloadSchema,
  type SerializedFulfillmentDemandChangedV2,
} from './fulfillment-demand-changed-v2.ts';

const payload = (): SerializedFulfillmentDemandChangedV2 => ({
  schemaVersion: 2,
  eventType: 'fulfillment_demand_changed',
  fulfillmentId: '00000000-0000-4000-8000-000000000001',
  displayNumber: 'P-100',
  locationId: 'location-1',
  typeCode: 'wash_fold',
  admissionState: 'released',
  commercialState: 'open',
  dueAt: '2026-08-23T20:00:00.000Z',
  estimatedWeightLbs: 18,
  estimatedWeightSource: 'source_estimate',
  version: 3,
  observedAt: '2026-08-22T16:00:00.000Z',
});

describe('fulfillment_demand_changed.v2 public contract', () => {
  it('owns the exact external descriptor and round-trips the established payload', () => {
    expect(fulfillmentDemandChangedV2MessageContract).toMatchObject({
      id: 'fulfillment_demand_changed.v2',
      type: 'fulfillment_demand_changed',
      version: 2,
      scope: 'external',
    });
    expect(
      fulfillmentDemandChangedV2MessageContract.payload.decode(payload()),
    ).toEqual({ kind: 'valid', value: payload() });
    expect(
      fulfillmentDemandChangedV2MessageContract.payload.encode(payload()),
    ).toEqual(payload());
  });

  it.each([
    ['additional fields', { ...payload(), extra: true }],
    ['an unsupported schema version', { ...payload(), schemaVersion: 1 }],
    ['a non-UUID fulfillment identity', { ...payload(), fulfillmentId: 'bad' }],
    ['an empty display number', { ...payload(), displayNumber: '' }],
    ['a non-UTC due timestamp', { ...payload(), dueAt: '2026-08-23' }],
    ['a nonpositive weight', { ...payload(), estimatedWeightLbs: 0 }],
    [
      'weight without provenance',
      { ...payload(), estimatedWeightSource: null },
    ],
    ['retired external bag evidence', { ...payload(), bagCount: 1 }],
    ['a nonpositive version', { ...payload(), version: 0 }],
  ])('rejects %s', (_, value) => {
    expect(
      fulfillmentDemandChangedV2PayloadSchema.safeParse(value).success,
    ).toBe(false);
    expect(
      fulfillmentDemandChangedV2MessageContract.payload.decode(value).kind,
    ).toBe('invalid');
  });

  it('fails closed when a typed value is unsafely forged before encoding', () => {
    expect(() =>
      fulfillmentDemandChangedV2MessageContract.payload.encode({
        ...payload(),
        dueAt: 'not-a-date',
      }),
    ).toThrow(
      expect.objectContaining({
        kind: 'InvariantViolationError',
        code: 'orders_fulfillment_demand_changed_payload_invalid',
      }),
    );
  });
});
