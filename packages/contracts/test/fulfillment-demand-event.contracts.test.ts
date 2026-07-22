import {
  fulfillmentDemandChangedEventSchema,
  fulfillmentDemandChangedEventType,
} from '../src/index.ts';
import { describe, expect, it } from 'vitest';

const event = {
  schemaVersion: 1,
  eventType: fulfillmentDemandChangedEventType,
  fulfillmentId: '00000000-0000-4000-8000-000000000001',
  displayNumber: 'P-1001',
  locationId: 'east',
  typeCode: 'wash_fold',
  admissionState: 'released',
  commercialState: 'open',
  dueAt: '2026-07-22T20:00:00.000Z',
  estimatedWeightLbs: 42,
  estimatedWeightSource: 'source_estimate',
  bagCount: 2,
  version: 3,
  observedAt: '2026-07-21T20:00:00.000Z',
} as const;

describe('fulfillment demand integration event', () => {
  it('accepts the versioned source-neutral event', () => {
    expect(fulfillmentDemandChangedEventSchema.parse(event)).toEqual(event);
  });

  it('rejects unknown versions and inconsistent weight provenance', () => {
    expect(
      fulfillmentDemandChangedEventSchema.safeParse({
        ...event,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      fulfillmentDemandChangedEventSchema.safeParse({
        ...event,
        estimatedWeightSource: null,
      }).success,
    ).toBe(false);
  });
});
