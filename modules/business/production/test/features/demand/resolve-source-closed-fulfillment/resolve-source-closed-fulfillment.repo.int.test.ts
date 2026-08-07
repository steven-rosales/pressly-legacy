import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeResolveSourceClosedFulfillmentRepository } from '../../../../src/features/demand/resolve-source-closed-fulfillment/resolve-source-closed-fulfillment.repo.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../../../support/database.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  demand: '10000000-0000-4000-8000-000000000101',
  order: '20000000-0000-4000-8000-000000000101',
} as const;

describe('source-closed fulfillment resolution Postgres repository', () => {
  it('finds the exact location-scoped Production projection by canonical fulfillment', async () => {
    const now = new Date('2026-07-26T23:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Resolution Lookup Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.demand,
      demandKey: 'test:resolution:fulfillment-lookup',
      displayReference: 'RESOLUTION-LOOKUP-101',
      locationId: 'location-1',
      revisionHash: 'resolution-lookup',
      revisionAt: now,
      phase: 'expected',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_price',
      dueAt: new Date('2026-07-27T20:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-27T20:00:00.000Z'),
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
    });
    const repo = makeResolveSourceClosedFulfillmentRepository(testDb.db);

    await expect(repo.findCandidate('location-1', ids.demand)).resolves.toEqual(
      {
        orderId: ids.order,
        locationId: 'location-1',
        productionVersion: 1,
        resolutionState: 'open',
        sourceAdmissionState: 'unreleased',
        sourceCommercialState: 'open',
      },
    );
    await expect(
      repo.findCandidate('other-location', ids.demand),
    ).resolves.toBeNull();
  });
});
