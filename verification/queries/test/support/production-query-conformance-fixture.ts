import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  productionQueryConformanceAsOf,
  productionQueryConformanceIds as ids,
  productionQueryConformanceLocations as locations,
} from '../../src/public.ts';
import { seedProductionLocationConformanceFacts } from './production-location-conformance.postgres.ts';

const tables = [
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_shifts',
  'production_orders',
  'order_demands',
  'production_locations',
  'access_production_locations',
  'business_accounts',
] as const;

export const createProductionQueryConformanceDatabase =
  (): TestDatabaseRuntime =>
    createTestDatabaseRuntime({
      databaseUrl: getTestDatabaseUrl(
        'PRESSLY_TEST_DATABASE_URL',
        'postgres://pressly:pressly@localhost:55434/pressly_test',
      ),
      tableNames: tables,
      maxConnections: 2,
      ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
        ? {}
        : {
            resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
          }),
    });

const dueDates = [
  new Date('2026-08-21T03:59:59.000Z'),
  new Date('2026-08-21T04:00:00.000Z'),
  new Date('2026-08-22T04:00:00.000Z'),
  new Date('2026-08-23T04:00:00.000Z'),
  new Date('2026-08-24T04:00:00.000Z'),
  new Date('2026-08-25T04:00:00.000Z'),
] as const;

const displayReferences = [
  'DISPLAY-OVERDUE',
  'DISPLAY-TODAY',
  'DISPLAY-TOMORROW',
  'DISPLAY-LATER',
  'DISPLAY-RESOLVED',
  'DISPLAY-FINISHED',
] as const;

const seedLocations = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(presslyPostgresOwnerSchemas.access.businessAccounts).values({
    id: ids.business,
    slug: 'production-query-conformance',
    displayName: 'Production Query Conformance',
  });
  await seedProductionLocationConformanceFacts(db, [
    {
      id: locations.main,
      businessId: ids.business,
      name: 'Alpha Laundry',
      timezone: 'America/New_York',
      liveRevision: 7,
    },
    {
      id: locations.alpha,
      businessId: ids.business,
      name: 'Alpha Laundry',
      timezone: 'America/Chicago',
      liveRevision: 3,
    },
    {
      id: locations.inactive,
      businessId: ids.business,
      name: 'Dormant Laundry',
      timezone: 'America/Los_Angeles',
      isActive: false,
      liveRevision: 2,
    },
    {
      id: locations.sibling,
      businessId: ids.business,
      name: 'Zulu Laundry',
      timezone: 'America/Denver',
      liveRevision: 1,
    },
  ]);
  await db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values([
      {
        id: locations.main,
        businessId: ids.business,
        name: 'Alpha Laundry',
        timezone: 'America/New_York',
      },
      {
        id: locations.alpha,
        businessId: ids.business,
        name: 'Alpha Laundry',
        timezone: 'America/Chicago',
      },
      {
        id: locations.inactive,
        businessId: ids.business,
        name: 'Dormant Laundry',
        timezone: 'America/Los_Angeles',
        isActive: false,
      },
      {
        id: locations.sibling,
        businessId: ids.business,
        name: 'Zulu Laundry',
        timezone: 'America/Denver',
      },
    ]);
};

const seedProductionOrders = async (db: PostgresDatabase): Promise<void> => {
  await db.insert(presslyPostgresOwnerSchemas.production.orderDemands).values(
    ids.demands.map((id, index) => ({
      id,
      fulfillmentId: ids.fulfillments[index] ?? ids.fulfillments[0],
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference:
        displayReferences[index] ?? `DISPLAY-${String(index + 1)}`,
      locationId: locations.main,
      revisionAt: productionQueryConformanceAsOf,
      phase: 'production_released',
      estimatedWeightLbs: 20 + index,
      estimatedWeightSource: 'test_estimate',
      dueAt: dueDates[index] ?? productionQueryConformanceAsOf,
    })),
  );

  const statuses = [
    'eligible',
    'scheduled',
    'intake_pending',
    'release_pending',
    'eligible',
    'finished',
  ] as const;
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values(
      ids.productionOrders.map((id, index) => {
        const resolved = index === 4;
        const finished = index === 5;
        const hasIntake = index < 2 || index > 3;
        return {
          id,
          orderDemandId: ids.demands[index] ?? ids.demands[0],
          locationId: locations.main,
          dueAt: dueDates[index] ?? productionQueryConformanceAsOf,
          priority: index === 1 || index === 4,
          operationalStatus: statuses[index] ?? 'eligible',
          executionStatus: finished
            ? 'finished'
            : index === 1
              ? 'scheduled'
              : 'unassigned',
          resolutionState: resolved ? 'resolved_without_production' : 'open',
          ...(resolved
            ? {
                resolvedAt: productionQueryConformanceAsOf,
                resolvedBy: ids.actor,
                resolutionReason: 'other',
                resolutionNote: 'Excluded conformance fixture',
              }
            : {}),
          derivedWeightLbs: 20 + index,
          derivedWeightSource: 'test_estimate',
          bagCount: hasIntake ? index + 1 : null,
          bagCountSource: hasIntake ? 'operator_intake' : null,
          intakeVersion: hasIntake ? 1 : 0,
          ...(finished ? { finishedAt: productionQueryConformanceAsOf } : {}),
          version: index + 1,
        };
      }),
    );
};

const seedHistory = async (db: PostgresDatabase): Promise<void> => {
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values([
      {
        id: ids.shifts[0],
        locationId: locations.main,
        startsAt: new Date('2026-08-19T08:00:00.000Z'),
        endsAt: new Date('2026-08-19T16:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'closed',
        effectiveFolderCount: 2,
      },
      {
        id: ids.shifts[1],
        locationId: locations.main,
        startsAt: new Date('2026-08-20T08:00:00.000Z'),
        endsAt: new Date('2026-08-20T16:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'closed',
        effectiveFolderCount: 3,
      },
      {
        id: ids.shifts[2],
        locationId: locations.main,
        startsAt: new Date('2026-08-21T08:00:00.000Z'),
        endsAt: new Date('2026-08-21T16:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 4,
      },
    ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: ids.schedulerConfig,
      locationId: locations.main,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: ids.actor,
    });
  await db.insert(presslyPostgresOwnerSchemas.production.scheduleRuns).values(
    ids.scheduleRuns.map((id, index) => ({
      id,
      locationId: locations.main,
      productionShiftId: ids.shifts[index] ?? ids.shifts[0],
      schedulerConfigId: ids.schedulerConfig,
      status: 'accepted',
      inputSnapshot: {},
      inputSnapshotHash: 'c'.repeat(64),
      outputPlan: {},
      outputPlanHash: 'd'.repeat(64),
      algorithmVersion: `conformance-${String(index + 1)}`,
      pulseCapacityLbs: 100,
      batchCount: index === 2 ? 2 : index === 1 ? 1 : 0,
      makespanMinutes: 56 * (index + 1),
      plannedCompletionAt: new Date(
        `2026-08-${String(19 + index).padStart(2, '0')}T14:00:00.000Z`,
      ),
      warnings: [],
      acknowledgedWarningCodes: [],
      acceptedAt: new Date('2026-08-18T20:00:00.000Z'),
      acceptedBy: ids.actor,
    })),
  );
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values([
      {
        id: ids.productionRuns[0],
        locationId: locations.main,
        productionShiftId: ids.shifts[0],
        scheduleRunId: ids.scheduleRuns[0],
        status: 'completed',
        startedAt: new Date('2026-08-19T08:00:00.000Z'),
        completedAt: new Date('2026-08-19T15:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-19T14:00:00.000Z'),
        version: 2,
      },
      {
        id: ids.productionRuns[1],
        locationId: locations.main,
        productionShiftId: ids.shifts[1],
        scheduleRunId: ids.scheduleRuns[1],
        status: 'completed',
        startedAt: new Date('2026-08-20T08:00:00.000Z'),
        completedAt: new Date('2026-08-20T15:00:00.000Z'),
        queueVersion: 2,
        plannedCompletionAt: new Date('2026-08-20T14:00:00.000Z'),
        version: 3,
      },
      {
        id: ids.productionRuns[2],
        locationId: locations.main,
        productionShiftId: ids.shifts[2],
        scheduleRunId: ids.scheduleRuns[2],
        status: 'started',
        startedAt: new Date('2026-08-21T08:00:00.000Z'),
        completedAt: null,
        queueVersion: 3,
        plannedCompletionAt: new Date('2026-08-21T14:00:00.000Z'),
        version: 1,
      },
    ]);

  for (const [id, createdAt] of [
    [ids.productionRuns[0], '2026-08-21T15:44:59.999900Z'],
    [ids.productionRuns[1], '2026-08-21T15:45:00.000000Z'],
    [ids.productionRuns[2], '2026-08-21T15:45:00.000900Z'],
  ] as const)
    await db
      .update(presslyPostgresOwnerSchemas.production.productionRuns)
      .set({ createdAt: sql<Date>`${createdAt}::timestamptz` })
      .where(eq(presslyPostgresOwnerSchemas.production.productionRuns.id, id));

  await db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.batches[0],
        locationId: locations.main,
        productionRunId: ids.productionRuns[2],
        sequenceIndex: 0,
        status: 'finished',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-21T12:00:00.000Z'),
        startedAt: new Date('2026-08-21T08:00:00.000Z'),
        finishedAt: new Date('2026-08-21T11:30:00.000Z'),
        membershipFrozenAt: new Date('2026-08-21T08:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        version: 3,
      },
      {
        id: ids.batches[1],
        locationId: locations.main,
        productionRunId: ids.productionRuns[2],
        sequenceIndex: 1,
        status: 'sorting',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 40,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-21T14:00:00.000Z'),
        startedAt: new Date('2026-08-21T12:00:00.000Z'),
        membershipFrozenAt: new Date('2026-08-21T12:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        version: 2,
      },
      {
        id: ids.batches[2],
        locationId: locations.main,
        productionRunId: ids.productionRuns[1],
        sequenceIndex: 0,
        status: 'finished',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 25,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-20T14:00:00.000Z'),
        startedAt: new Date('2026-08-20T08:00:00.000Z'),
        finishedAt: new Date('2026-08-20T13:30:00.000Z'),
        membershipFrozenAt: new Date('2026-08-20T08:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        version: 4,
      },
    ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values([
      {
        id: ids.memberships[0],
        locationId: locations.main,
        productionBatchId: ids.batches[0],
        productionOrderId: ids.productionOrders[0],
        placementProvenance: 'initial_schedule',
      },
      {
        id: ids.memberships[1],
        locationId: locations.main,
        productionBatchId: ids.batches[1],
        productionOrderId: ids.productionOrders[1],
        placementProvenance: 'initial_schedule',
      },
      {
        id: ids.memberships[2],
        locationId: locations.main,
        productionBatchId: ids.batches[2],
        productionOrderId: ids.productionOrders[2],
        placementProvenance: 'initial_schedule',
      },
    ]);
};

export const seedProductionQueryConformance = async (
  db: PostgresDatabase,
): Promise<void> => {
  await seedLocations(db);
  await seedProductionOrders(db);
  await seedHistory(db);
};

export const readProductionQueryState = async (db: PostgresDatabase) => ({
  locations: await db
    .select()
    .from(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.access.accessProductionLocations.id),
    ),
  demands: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.orderDemands)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.orderDemands.id)),
  productionOrders: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionOrders)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
  shifts: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionShifts)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionShifts.id)),
  configs: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.schedulerConfigs.id)),
  schedules: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.scheduleRuns.id)),
  runs: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionRuns)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionRuns.id)),
  batches: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionBatches)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.productionBatches.id)),
  memberships: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.productionBatchOrders.id),
    ),
});

export type ProductionQueryReadState = Awaited<
  ReturnType<typeof readProductionQueryState>
>;
