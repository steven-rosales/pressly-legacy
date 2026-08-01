import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { laundryProduction } from '@pressly/db';
import { makeListProductionOrderControlRepository } from '../../src/list-production-order-control/list-production-order-control.repo.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../support/database.ts';
import { allowPolicy } from '../support/production.fake.ts';

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
  completedDemand: '10000000-0000-4000-8000-000000000004',
  completedOrder: '20000000-0000-4000-8000-000000000004',
  canceledDemand: '10000000-0000-4000-8000-000000000005',
  canceledOrder: '20000000-0000-4000-8000-000000000005',
  intakeDemand: '10000000-0000-4000-8000-000000000006',
  intakeOrder: '20000000-0000-4000-8000-000000000006',
  placementDemand: '10000000-0000-4000-8000-000000000007',
  placementOrder: '20000000-0000-4000-8000-000000000007',
  resolvedDemand: '10000000-0000-4000-8000-000000000008',
  resolvedOrder: '20000000-0000-4000-8000-000000000008',
  resolver: '30000000-0000-4000-8000-000000000008',
} as const;

const seedOrder = async (input: {
  demandId: string;
  orderId: string;
  reference: string;
  dueAt: string;
  status: 'intake_pending' | 'eligible' | 'scheduled' | 'finished';
  phase?: 'production_released' | 'post_production' | 'withdrawn';
  commercialState?: 'open' | 'completed' | 'canceled';
  pendingPlacement?: Readonly<Record<string, unknown>> | null;
  resolutionState?: 'open' | 'resolved_without_production';
}) => {
  const dueAt = new Date(input.dueAt);
  const phase =
    input.phase ??
    (input.status === 'finished' ? 'post_production' : 'production_released');
  await seedProductionDemands(testDb.db, {
    id: input.demandId,
    demandKey: `test:${input.reference}`,
    displayReference: input.reference,
    locationId: 'location-1',
    revisionHash: input.reference,
    revisionAt: dueAt,
    phase,
    commercialState:
      input.commercialState ??
      (input.status === 'finished' ? 'completed' : 'open'),
    estimatedWeightLbs: 10,
    estimatedWeightSource: 'external_price',
    dueAt,
  });
  await testDb.db.insert(laundryProduction.productionOrders).values({
    id: input.orderId,
    orderDemandId: input.demandId,
    locationId: 'location-1',
    dueAt,
    operationalStatus: input.status,
    executionStatus:
      input.status === 'finished'
        ? 'finished'
        : input.status === 'scheduled'
          ? 'scheduled'
          : 'unassigned',
    derivedWeightLbs: 10,
    bagCount: input.status === 'intake_pending' ? null : 1,
    bagCountSource:
      input.status === 'intake_pending' ? null : 'operator_intake',
    intakeRecordedAt: input.status === 'intake_pending' ? null : dueAt,
    intakeVersion: input.status === 'intake_pending' ? 0 : 1,
    pendingPlacement: input.pendingPlacement ?? null,
    resolutionState: input.resolutionState ?? 'open',
    ...(input.resolutionState === 'resolved_without_production'
      ? {
          resolvedAt: dueAt,
          resolvedBy: ids.resolver,
          resolutionReason: 'completed_outside_pressly',
        }
      : {}),
    ...(input.status === 'finished' ? { finishedAt: dueAt } : {}),
  });
};

describe('list production order control due filtering', () => {
  it('uses the location calendar and excludes finished work', async () => {
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
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
    await seedOrder({
      demandId: ids.resolvedDemand,
      orderId: ids.resolvedOrder,
      reference: 'ARCHIVED-OLD',
      dueAt: '2026-07-16T21:00:00.000Z',
      status: 'eligible',
      resolutionState: 'resolved_without_production',
    });

    const result = await makeListProductionOrderControlRepository({
      db: testDb.db,
      policy: allowPolicy,
    }).list(
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
    expect(result.value.counts.all).toBe(2);
  });

  it('does not turn source lifecycle differences into floor attention', async () => {
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Attention Test Facility',
      timezone: 'America/New_York',
    });
    const dueAt = '2026-07-20T20:00:00.000Z';
    await seedOrder({
      demandId: ids.completedDemand,
      orderId: ids.completedOrder,
      reference: 'COMMERCIAL-COMPLETE',
      dueAt,
      status: 'eligible',
      phase: 'post_production',
      commercialState: 'completed',
    });
    await seedOrder({
      demandId: ids.canceledDemand,
      orderId: ids.canceledOrder,
      reference: 'SOURCE-CANCELED',
      dueAt,
      status: 'scheduled',
      phase: 'withdrawn',
      commercialState: 'canceled',
    });
    await seedOrder({
      demandId: ids.finishedDemand,
      orderId: ids.finishedOrder,
      reference: 'PRESSLY-FINISHED',
      dueAt,
      status: 'finished',
      phase: 'production_released',
    });
    await seedOrder({
      demandId: ids.intakeDemand,
      orderId: ids.intakeOrder,
      reference: 'INTAKE-REQUIRED',
      dueAt,
      status: 'intake_pending',
    });
    await seedOrder({
      demandId: ids.placementDemand,
      orderId: ids.placementOrder,
      reference: 'PLACEMENT-REQUIRED',
      dueAt,
      status: 'eligible',
      pendingPlacement: { reason: 'placement_pending' },
    });

    const result = await makeListProductionOrderControlRepository({
      db: testDb.db,
      policy: allowPolicy,
    }).list(
      {
        locationId: 'location-1',
        view: 'attention',
        limit: 25,
      },
      new Date('2026-07-20T15:09:00.000Z'),
    );

    expect(result.tag).toBe('found');
    if (result.tag !== 'found') return;
    expect(
      result.value.items.map((item) => [
        item.order.externalOrderId,
        item.attention?.reason,
      ]),
    ).toEqual([
      ['INTAKE-REQUIRED', 'intake_required'],
      ['PLACEMENT-REQUIRED', 'placement_pending'],
    ]);
    expect(result.value.counts.attention).toBe(2);
  });
});
