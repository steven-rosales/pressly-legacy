import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { laundryProduction } from '@pressly/db';
import { makeListProductionOrderControlRepository } from '../../src/list-production-order-control/list-production-order-control.repo.ts';
import { createProductionTestDatabase } from '../support/database.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  overdueDemand: '10000000-0000-4000-8000-000000000001',
  overdueOrder: '20000000-0000-4000-8000-000000000001',
  todayDemand: '10000000-0000-4000-8000-000000000002',
  todayOrder: '20000000-0000-4000-8000-000000000002',
  finishedDemand: '10000000-0000-4000-8000-000000000003',
  finishedOrder: '20000000-0000-4000-8000-000000000003',
} as const;

const seedOrder = async (input: {
  demandId: string;
  orderId: string;
  reference: string;
  dueAt: string;
  status: 'eligible' | 'finished';
}) => {
  const dueAt = new Date(input.dueAt);
  await testDb.db.insert(laundryProduction.orderDemands).values({
    id: input.demandId,
    demandKey: `test:${input.reference}`,
    displayReference: input.reference,
    locationId: 'location-1',
    revisionHash: input.reference,
    revisionAt: dueAt,
    phase:
      input.status === 'finished' ? 'post_production' : 'production_released',
    sourceStatusCode: input.status === 'finished' ? 'COMPLETED' : 'IN_PROGRESS',
    estimatedWeightLbs: 10,
    estimatedWeightSource: 'external_price',
    dueAt,
  });
  await testDb.db.insert(laundryProduction.productionOrders).values({
    id: input.orderId,
    orderDemandId: input.demandId,
    locationId: 'location-1',
    dueAt,
    status: input.status,
    derivedWeightLbs: 10,
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: dueAt,
    intakeVersion: 1,
    ...(input.status === 'finished' ? { finishedAt: dueAt } : {}),
  });
};

describe('list production order control due filtering', () => {
  it('uses the location calendar and excludes finished work', async () => {
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      name: 'Timezone Test Facility',
      timezone: 'America/New_York',
    });
    await seedOrder({
      demandId: ids.overdueDemand,
      orderId: ids.overdueOrder,
      reference: 'LOCAL-OVERDUE',
      dueAt: '2026-07-20T00:22:33.429Z',
      status: 'eligible',
    });
    await seedOrder({
      demandId: ids.todayDemand,
      orderId: ids.todayOrder,
      reference: 'LOCAL-TODAY',
      dueAt: '2026-07-20T04:00:00.000Z',
      status: 'eligible',
    });
    await seedOrder({
      demandId: ids.finishedDemand,
      orderId: ids.finishedOrder,
      reference: 'FINISHED-OLD',
      dueAt: '2026-07-16T21:00:00.000Z',
      status: 'finished',
    });

    const result = await makeListProductionOrderControlRepository(
      testDb.db,
    ).list(
      {
        locationId: 'location-1',
        view: 'all',
        dueBucket: 'overdue',
        limit: 25,
      },
      new Date('2026-07-20T15:09:00.000Z'),
    );

    expect(result.tag).toBe('found');
    if (result.tag !== 'found') return;
    expect(
      result.value.items.map((item) => item.order.externalOrderId),
    ).toEqual(['LOCAL-OVERDUE']);
    expect(result.value.items[0]?.order.dueBucket).toBe('overdue');
  });
});
