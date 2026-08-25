import { eq, sql } from '@pressly/postgres/query';
import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeListHistoryRunsPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_orders',
    'production_shifts',
    'order_demands',
    'production_locations',
  ],
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const businessId = '00000000-0000-4000-8000-000000000100';
const actorId = '10000000-0000-4000-8000-000000000001';
const asOf = new Date('2026-08-21T20:00:00.000Z');
const ids = {
  firstShift: '10000000-0000-4000-8000-000000000002',
  secondShift: '10000000-0000-4000-8000-000000000003',
  config: '10000000-0000-4000-8000-000000000004',
  firstSchedule: '10000000-0000-4000-8000-000000000005',
  secondSchedule: '10000000-0000-4000-8000-000000000006',
  firstRun: '10000000-0000-4000-8000-000000000007',
  secondRun: '10000000-0000-4000-8000-000000000008',
  batch: '10000000-0000-4000-8000-000000000009',
  sourceOrder: '10000000-0000-4000-8000-000000000010',
  fulfillment: '10000000-0000-4000-8000-000000000011',
  demand: '10000000-0000-4000-8000-000000000012',
  productionOrder: '10000000-0000-4000-8000-000000000013',
} as const;

const seed = async (): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: 'location-1',
      businessId,
      name: 'Run History Facility',
      timezone: 'America/New_York',
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values([
    {
      id: ids.firstShift,
      locationId: 'location-1',
      startsAt: new Date('2026-08-20T08:00:00.000Z'),
      endsAt: new Date('2026-08-20T16:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'closed',
      effectiveFolderCount: 2,
    },
    {
      id: ids.secondShift,
      locationId: 'location-1',
      startsAt: new Date('2026-08-21T08:00:00.000Z'),
      endsAt: new Date('2026-08-21T16:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'closed',
      effectiveFolderCount: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
    locationId: 'location-1',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: actorId,
  });
  const schedule = (id: string, shiftId: string) => ({
    id,
    locationId: 'location-1',
    productionShiftId: shiftId,
    schedulerConfigId: ids.config,
    status: 'accepted' as const,
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2' as const,
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 224,
    plannedCompletionAt: new Date('2026-08-21T14:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-08-19T20:00:00.000Z'),
    acceptedBy: actorId,
  });
  await database.db
    .insert(productionTestSchema.scheduleRuns)
    .values([
      schedule(ids.firstSchedule, ids.firstShift),
      schedule(ids.secondSchedule, ids.secondShift),
    ]);
  await database.db.insert(productionTestSchema.productionRuns).values([
    {
      id: ids.firstRun,
      locationId: 'location-1',
      productionShiftId: ids.firstShift,
      scheduleRunId: ids.firstSchedule,
      status: 'completed',
      startedAt: new Date('2026-08-20T08:00:00.000Z'),
      completedAt: new Date('2026-08-20T15:00:00.000Z'),
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-20T14:00:00.000Z'),
    },
    {
      id: ids.secondRun,
      locationId: 'location-1',
      productionShiftId: ids.secondShift,
      scheduleRunId: ids.secondSchedule,
      status: 'completed',
      startedAt: new Date('2026-08-21T08:00:00.000Z'),
      completedAt: new Date('2026-08-21T15:00:00.000Z'),
      queueVersion: 2,
      plannedCompletionAt: new Date('2026-08-21T14:00:00.000Z'),
    },
  ]);
  for (const [id, createdAt] of [
    [ids.firstRun, '2026-08-21T19:45:00.000100Z'],
    [ids.secondRun, '2026-08-21T19:45:00.000900Z'],
  ] as const)
    await database.db
      .update(productionTestSchema.productionRuns)
      .set({ createdAt: sql<Date>`${createdAt}::timestamptz` })
      .where(eq(productionTestSchema.productionRuns.id, id));

  await database.db.insert(productionTestSchema.orderDemands).values({
    id: ids.demand,
    fulfillmentId: ids.fulfillment,
    fulfillmentVersion: 1,
    projectionHash: 'a'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: 'RUN-ORDER-1',
    locationId: 'location-1',
    revisionAt: asOf,
    phase: 'production_released',
    estimatedWeightLbs: 30,
    estimatedWeightSource: 'test_estimate',
    dueAt: asOf,
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: ids.productionOrder,
    orderDemandId: ids.demand,
    locationId: 'location-1',
    dueAt: asOf,
    priority: true,
    operationalStatus: 'scheduled',
    executionStatus: 'scheduled',
    resolutionState: 'open',
    derivedWeightLbs: 30,
    bagCount: 1,
    bagCountSource: 'operator_intake',
    intakeVersion: 1,
  });
  await database.db.insert(productionTestSchema.productionBatches).values({
    id: ids.batch,
    locationId: 'location-1',
    productionRunId: ids.secondRun,
    sequenceIndex: 0,
    status: 'finished',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 30,
    pulseMinutes: 56,
    plannedDoneAt: new Date('2026-08-21T14:00:00.000Z'),
    startedAt: new Date('2026-08-21T08:00:00.000Z'),
    finishedAt: new Date('2026-08-21T15:00:00.000Z'),
    membershipFrozenAt: new Date('2026-08-21T08:00:00.000Z'),
    membershipFrozenBy: actorId,
  });
  await database.db.insert(productionTestSchema.productionBatchOrders).values({
    locationId: 'location-1',
    productionBatchId: ids.batch,
    productionOrderId: ids.productionOrder,
    placementProvenance: 'initial_schedule',
  });
};

describe('list-history-runs PostgreSQL read model', () => {
  it('paginates exact timestamps and loads page aggregates in one snapshot', async () => {
    await seed();
    const repository = makeListHistoryRunsPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const first = await repository.list(
      { locationId: 'location-1', limit: 1 },
      asOf,
    );
    expect(first.kind).toBe('found');
    if (first.kind !== 'found') return;
    expect(first.page.items).toEqual([
      expect.objectContaining({
        productionRunId: ids.secondRun,
        batchCount: 1,
        completedBatchCount: 1,
        orderCount: 1,
        priorityOrderCount: 1,
        totalWeightLbs: 30,
      }),
    ]);
    expect(first.page.asOf).toBe(asOf);

    const second = await repository.list(
      {
        locationId: 'location-1',
        limit: 1,
        cursor: first.page.nextCursor ?? '',
      },
      asOf,
    );
    expect(second).toMatchObject({
      kind: 'found',
      page: {
        items: [expect.objectContaining({ productionRunId: ids.firstRun })],
        nextCursor: null,
      },
    });
  });

  it('binds status/search filters and rejects unknown locations', async () => {
    await seed();
    const repository = makeListHistoryRunsPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    await expect(
      repository.list(
        {
          locationId: 'location-1',
          limit: 50,
          status: 'completed',
          search: ids.firstSchedule.toUpperCase(),
        },
        asOf,
      ),
    ).resolves.toMatchObject({
      kind: 'found',
      page: {
        items: [expect.objectContaining({ productionRunId: ids.firstRun })],
      },
    });
    await expect(
      repository.list({ locationId: 'missing', limit: 50 }, asOf),
    ).resolves.toEqual({ kind: 'location_not_found' });
  });
});
