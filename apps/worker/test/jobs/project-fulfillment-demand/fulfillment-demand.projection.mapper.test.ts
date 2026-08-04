import type { FulfillmentDemandChangedEvent } from '@pressly/orders';
import { describe, expect, it } from 'vitest';
import {
  fulfillmentDemandProjectionHash,
  toApplyFulfillmentDemandCommand,
} from '../../../src/jobs/project-fulfillment-demand/fulfillment-demand.projection.mapper.ts';

const demand: FulfillmentDemandChangedEvent = {
  schemaVersion: 1,
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
  bagCount: 2,
  version: 2,
  observedAt: new Date('2026-07-21T14:00:00.000Z'),
};

describe('fulfillment demand projection mapper', () => {
  it('preserves the established serialized projection hash', () => {
    expect(fulfillmentDemandProjectionHash(demand)).toBe(
      'e82aef86adbaf56d03e0620d744a977be8d0d1794eb303498ccef917908fa605',
    );
  });

  it('maps module-owned Dates to the Production command boundary', () => {
    expect(
      toApplyFulfillmentDemandCommand({
        eventId: '00000000-0000-4000-8000-000000000001',
        demand,
      }),
    ).toEqual({
      fulfillmentId: demand.fulfillmentId,
      fulfillmentVersion: 2,
      projectionHash:
        'e82aef86adbaf56d03e0620d744a977be8d0d1794eb303498ccef917908fa605',
      displayReference: 'P-1042',
      locationId: 'location-1',
      admissionState: 'released',
      commercialState: 'completed',
      dueAt: '2026-07-22T20:00:00.000Z',
      observedAt: '2026-07-21T14:00:00.000Z',
      estimatedWeightLbs: 42,
      estimatedWeightSource: 'external_estimate',
      bagCount: 2,
      idempotencyKey: 'order-outbox:00000000-0000-4000-8000-000000000001',
    });
  });
});
