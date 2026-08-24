import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  previewOrderRouteConformanceIds as ids,
  previewOrderRouteConformanceLocationId as locationId,
  type PreviewOrderRouteFixture,
} from '../../src/public.ts';
import { seedProductionLocationConformanceFacts } from './production-location-conformance.postgres.ts';

const tables = [
  'work_events',
  'production_order_stage_attempts',
  'stage_machine_assignments',
  'stage_runs',
  'production_batch_orders',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'scheduler_configs',
  'production_machines',
  'production_stations',
  'production_orders',
  'production_shifts',
  'order_demands',
  'production_locations',
] as const;

export const createPreviewOrderRouteConformanceDatabase =
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

const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
type Stage = (typeof stages)[number];

const startsAt = new Date('2026-08-21T12:00:00.000Z');
const endsAt = new Date('2026-08-22T00:00:00.000Z');
const targetBase = new Date('2026-08-21T17:00:00.000Z');
const lateTargetBase = new Date('2026-08-21T22:00:00.000Z');

const stationFor = (stage: Stage): string => ids.stations[stage];

const windowFor = (base: Date, stage: Stage) => {
  const index = stages.indexOf(stage);
  return {
    start: new Date(base.getTime() + index * 60 * 60_000),
    end: new Date(base.getTime() + (index + 1) * 60 * 60_000),
  };
};

const seedBoundary = async (db: PostgresDatabase): Promise<void> => {
  await seedProductionLocationConformanceFacts(db, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Preview Route Conformance Facility',
      timezone: 'America/New_York',
    },
  ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: ids.shift,
      locationId,
      startsAt,
      endsAt,
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    });
  await db.insert(presslyPostgresOwnerSchemas.production.stations).values(
    stages.map((stage, index) => ({
      id: stationFor(stage),
      locationId,
      kind: stage,
      label: stage,
      sortOrder: index + 1,
    })),
  );
};

const seedPlan = async (
  db: PostgresDatabase,
  fixture: PreviewOrderRouteFixture,
): Promise<void> => {
  const machineCapacity = fixture === 'hard-capacity' ? 40 : 100;
  const machinesActive = fixture !== 'invalid-target-graph';
  await db.insert(presslyPostgresOwnerSchemas.production.machines).values([
    {
      id: ids.washer,
      locationId,
      stationId: ids.stations.washing,
      label: 'Washer 1',
      effectiveCapacityLbs: machineCapacity,
      isActive: machinesActive,
    },
    {
      id: ids.dryer,
      locationId,
      stationId: ids.stations.drying,
      label: 'Dryer 1',
      effectiveCapacityLbs: machineCapacity,
      isActive: machinesActive,
    },
  ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: ids.schedulerConfig,
      locationId,
      pulseMinutes: 60,
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
  await db.insert(presslyPostgresOwnerSchemas.production.scheduleRuns).values({
    id: ids.scheduleRun,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.schedulerConfig,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 3,
    makespanMinutes: 720,
    plannedCompletionAt: endsAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: startsAt,
    acceptedBy: ids.actor,
  });
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: ids.productionRun,
      locationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.scheduleRun,
      status: 'started',
      startedAt: startsAt,
      queueVersion: 4,
      plannedCompletionAt: endsAt,
      version: 1,
    });
};

const seedProductionOrders = async (db: PostgresDatabase): Promise<void> => {
  const weights = [20, 10, 30, 40] as const;
  await db.insert(presslyPostgresOwnerSchemas.production.orderDemands).values(
    ids.demands.map((id, index) => ({
      id,
      fulfillmentId: ids.fulfillments[index] ?? ids.fulfillments[0],
      fulfillmentVersion: 1,
      projectionHash: 'c'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: `PREVIEW-ROUTE-${String(index + 1)}`,
      locationId,
      revisionAt: startsAt,
      phase: 'production_released',
      estimatedWeightLbs: weights[index] ?? weights[0],
      estimatedWeightSource: 'test_estimate',
      dueAt: endsAt,
    })),
  );
  const productionOrderIds = [
    ids.sourceOrder,
    ids.sourceAnchorOrder,
    ids.earlyTargetOrder,
    ids.lateTargetOrder,
  ] as const;
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values(
      productionOrderIds.map((id, index) => ({
        id,
        orderDemandId: ids.demands[index] ?? ids.demands[0],
        locationId,
        dueAt: endsAt,
        operationalStatus: 'scheduled',
        executionStatus: 'scheduled',
        resolutionState: 'open',
        derivedWeightLbs: weights[index] ?? weights[0],
        derivedWeightSource: 'test_estimate',
        bagCount: 1,
        bagCountSource: 'operator_intake',
        intakeVersion: 1,
        version: index === 0 ? 3 : 1,
        eligibleAt: startsAt,
      })),
    );
};

const seedBatches = async (
  db: PostgresDatabase,
  fixture: PreviewOrderRouteFixture,
): Promise<void> => {
  const inFlight = fixture === 'exception';
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.lateTargetBatch,
        locationId,
        productionRunId: ids.productionRun,
        sequenceIndex: 2,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 40,
        pulseMinutes: 60,
        plannedDoneAt: endsAt,
        version: 6,
      },
      {
        id: ids.sourceBatch,
        locationId,
        productionRunId: ids.productionRun,
        sequenceIndex: 0,
        status: inFlight ? 'washing' : 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 60,
        plannedDoneAt: new Date('2026-08-21T16:00:00.000Z'),
        ...(inFlight
          ? {
              startedAt: startsAt,
              membershipFrozenAt: startsAt,
              membershipFrozenBy: ids.actor,
            }
          : {}),
        version: 2,
      },
      {
        id: ids.earlyTargetBatch,
        locationId,
        productionRunId: ids.productionRun,
        sequenceIndex: 1,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 60,
        plannedDoneAt: new Date('2026-08-21T21:00:00.000Z'),
        version: 5,
      },
    ]);
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values([
      {
        locationId,
        productionBatchId: ids.sourceBatch,
        productionOrderId: ids.sourceOrder,
        placementProvenance: 'initial_schedule',
      },
      {
        locationId,
        productionBatchId: ids.sourceBatch,
        productionOrderId: ids.sourceAnchorOrder,
        placementProvenance: 'initial_schedule',
      },
      {
        locationId,
        productionBatchId: ids.earlyTargetBatch,
        productionOrderId: ids.earlyTargetOrder,
        placementProvenance: 'initial_schedule',
      },
      {
        locationId,
        productionBatchId: ids.lateTargetBatch,
        productionOrderId: ids.lateTargetOrder,
        placementProvenance: 'initial_schedule',
      },
    ]);
};

const stageStatus = (
  fixture: PreviewOrderRouteFixture,
  stage: Stage,
): 'planned' | 'started' | 'completed' => {
  if (fixture !== 'exception') return 'planned';
  if (stage === 'sorting') return 'completed';
  if (stage === 'washing') return 'started';
  return 'planned';
};

const stageRow = (
  fixture: PreviewOrderRouteFixture,
  stageIds: Readonly<Record<Stage, string>>,
  productionBatchId: string,
  base: Date,
  stage: Stage,
) => {
  const window = windowFor(base, stage);
  const status =
    productionBatchId === ids.sourceBatch
      ? stageStatus(fixture, stage)
      : ('planned' as const);
  return {
    id: stageIds[stage],
    locationId,
    productionBatchId,
    stationId: stationFor(stage),
    stageKind: stage,
    status,
    plannedStartAt: window.start,
    plannedEndAt: window.end,
    ...(status === 'started'
      ? {
          actualStartAt: window.start,
          actualStartProvenance: 'live_observed' as const,
          startedBy: ids.actor,
        }
      : status === 'completed'
        ? {
            actualStartAt: window.start,
            actualEndAt: window.end,
            actualStartProvenance: 'live_observed' as const,
            actualEndProvenance: 'live_observed' as const,
            startedBy: ids.actor,
            completedBy: ids.actor,
          }
        : {}),
    version: status === 'planned' ? 1 : 2,
  };
};

const seedStages = async (
  db: PostgresDatabase,
  fixture: PreviewOrderRouteFixture,
): Promise<void> => {
  const plans = [
    [ids.sourceStages, ids.sourceBatch, startsAt],
    [ids.earlyTargetStages, ids.earlyTargetBatch, targetBase],
    [ids.lateTargetStages, ids.lateTargetBatch, lateTargetBase],
  ] as const;
  await db.insert(presslyPostgresOwnerSchemas.production.stageRuns).values(
    plans.flatMap(([stageIds, productionBatchId, base]) =>
      stages
        .slice()
        .reverse()
        .map((stage) =>
          stageRow(fixture, stageIds, productionBatchId, base, stage),
        ),
    ),
  );

  const attemptPlans = [
    [ids.sourceOrder, ids.sourceStages],
    [ids.sourceAnchorOrder, ids.sourceStages],
    [ids.earlyTargetOrder, ids.earlyTargetStages],
    [ids.lateTargetOrder, ids.lateTargetStages],
  ] as const;
  await db
    .insert(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .values(
      attemptPlans.flatMap(([productionOrderId, stageIds], orderIndex) =>
        stages
          .slice()
          .reverse()
          .map((stage) => {
            const completed =
              fixture === 'exception' &&
              orderIndex === 0 &&
              stage === 'sorting';
            return {
              locationId,
              productionRunId: ids.productionRun,
              productionOrderId,
              stageRunId: stageIds[stage],
              stageKind: stage,
              attemptNumber: 1,
              status: completed ? 'completed' : 'assigned',
              assignmentReason: 'initial_schedule',
              assignedAt: startsAt,
              assignedBy: ids.actor,
              ...(completed
                ? {
                    completedAt: windowFor(startsAt, stage).end,
                    completedBy: ids.actor,
                  }
                : {}),
            };
          }),
      ),
    );

  await db
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values(
      plans.flatMap(([stageIds, productionBatchId, base]) =>
        (['washing', 'drying'] as const).map((stage) => {
          const window = windowFor(base, stage);
          const activeSourceWashing =
            fixture === 'exception' &&
            productionBatchId === ids.sourceBatch &&
            stage === 'washing';
          return {
            locationId,
            stageRunId: stageIds[stage],
            machineId: stage === 'washing' ? ids.washer : ids.dryer,
            plannedStartAt: window.start,
            plannedEndAt: window.end,
            status: activeSourceWashing ? 'active' : 'planned',
            ...(activeSourceWashing ? { actualStartAt: window.start } : {}),
          };
        }),
      ),
    );
};

export const seedPreviewOrderRouteConformance = async (
  db: PostgresDatabase,
  fixture: PreviewOrderRouteFixture,
): Promise<void> => {
  await seedBoundary(db);
  await seedPlan(db, fixture);
  await seedProductionOrders(db);
  await seedBatches(db, fixture);
  await seedStages(db, fixture);
};

export const readPreviewOrderRouteState = async (db: PostgresDatabase) => ({
  locations: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionLocations)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.productionLocations.id),
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
  stations: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.stations)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.stations.id)),
  machines: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.machines)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.machines.id)),
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
  stageRuns: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.stageRuns)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.stageRuns.id)),
  machineAssignments: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .orderBy(
      asc(presslyPostgresOwnerSchemas.production.stageMachineAssignments.id),
    ),
  attempts: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .orderBy(
      asc(
        presslyPostgresOwnerSchemas.production.productionOrderStageAttempts.id,
      ),
    ),
  workEvents: await db
    .select()
    .from(presslyPostgresOwnerSchemas.production.workEvents)
    .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id)),
});

export type PreviewOrderRouteReadState = Awaited<
  ReturnType<typeof readPreviewOrderRouteState>
>;
