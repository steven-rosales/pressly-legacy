import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  commitOrderRouteConformanceIds as ids,
  commitOrderRouteConformanceLocationId as locationId,
  commitOrderRouteConformanceNow as now,
  commitOrderRouteConformanceOtherLocationId as otherLocationId,
  type CommitOrderRouteConformanceFixture,
  type CommitOrderRouteConformanceMutation,
} from '../../src/public.ts';
import { seedProductionLocationConformanceFacts } from '../../src/production-location-conformance.postgres.ts';

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

export const createCommitOrderRouteConformanceDatabase =
  (): TestDatabaseRuntime =>
    createTestDatabaseRuntime({
      databaseUrl: getTestDatabaseUrl(
        'PRESSLY_TEST_DATABASE_URL',
        'postgres://pressly:pressly@localhost:55434/pressly_test',
      ),
      tableNames: tables,
      maxConnections: 8,
      ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
        ? {}
        : {
            resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
          }),
    });

const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
type Stage = (typeof stages)[number];

const shiftStartsAt = new Date('2026-08-21T12:00:00.000Z');
const shiftEndsAt = new Date('2026-08-22T04:00:00.000Z');
const sourceBase = new Date('2026-08-21T13:00:00.000Z');
const earlyTargetBase = new Date('2026-08-21T18:00:00.000Z');
const lateTargetBase = new Date('2026-08-21T23:00:00.000Z');

const initialIds = Object.freeze({
  memberships: Object.freeze([
    '72000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    '72000000-0000-4000-8000-000000000004',
  ]),
  attempts: Object.freeze(
    Array.from(
      { length: 16 },
      (_, index) =>
        `72000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
    ),
  ),
  assignments: Object.freeze(
    Array.from(
      { length: 6 },
      (_, index) =>
        `72000000-0000-4000-8000-${String(index + 30).padStart(12, '0')}`,
    ),
  ),
});

const stationFor = (stage: Stage): string => ids.stations[stage];

const windowFor = (base: Date, stage: Stage) => {
  const index = stages.indexOf(stage);
  return {
    start: new Date(base.getTime() + index * 60 * 60_000),
    end: new Date(base.getTime() + (index + 1) * 60 * 60_000),
  };
};

const seedBoundary = async (database: PostgresDatabase): Promise<void> => {
  await seedProductionLocationConformanceFacts(database, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Commit Route Conformance Facility',
      timezone: 'America/New_York',
      createdAt: shiftStartsAt,
      updatedAt: shiftStartsAt,
    },
    {
      id: otherLocationId,
      businessId: ids.business,
      name: 'Commit Route Other Facility',
      timezone: 'America/New_York',
      createdAt: shiftStartsAt,
      updatedAt: shiftStartsAt,
    },
  ]);
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: ids.shift,
      locationId,
      startsAt: shiftStartsAt,
      endsAt: shiftEndsAt,
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
      version: 1,
      createdAt: shiftStartsAt,
      updatedAt: shiftStartsAt,
    });
  await database.insert(presslyPostgresOwnerSchemas.production.stations).values(
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
  database: PostgresDatabase,
  fixture: CommitOrderRouteConformanceFixture,
): Promise<void> => {
  const capacity = fixture === 'hard_capacity' ? 40 : 100;
  const active = fixture !== 'disabled_capacity';
  await database
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.washer,
        locationId,
        stationId: ids.stations.washing,
        label: 'Washer 1',
        effectiveCapacityLbs: capacity,
        isActive: active,
      },
      {
        id: ids.dryer,
        locationId,
        stationId: ids.stations.drying,
        label: 'Dryer 1',
        effectiveCapacityLbs: capacity,
        isActive: active,
      },
    ]);
  await database
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
  await database
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values({
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
      makespanMinutes: 420,
      plannedCompletionAt: shiftEndsAt,
      warnings: [],
      acknowledgedWarningCodes: [],
      acceptedAt: shiftStartsAt,
      acceptedBy: ids.actor,
    });
  const completed = fixture === 'completed_run';
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: ids.productionRun,
      locationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.scheduleRun,
      status: completed ? 'completed' : 'started',
      startedAt: shiftStartsAt,
      completedAt: completed ? now : null,
      queueVersion: 4,
      plannedCompletionAt: shiftEndsAt,
      overtimeProposalHash: 'c'.repeat(64),
      overtimeQueueVersion: 4,
      overtimeAcknowledgedBy: ids.actor,
      overtimeAcknowledgedAt: shiftStartsAt,
      version: 1,
      createdAt: shiftStartsAt,
      updatedAt: shiftStartsAt,
    });
};

const seedOrders = async (
  database: PostgresDatabase,
  fixture: CommitOrderRouteConformanceFixture,
): Promise<void> => {
  const weights = [20, 10, 30, 40] as const;
  await database
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values(
      ids.demands.map((id, index) => ({
        id,
        fulfillmentId: ids.fulfillments[index] ?? ids.fulfillments[0]!,
        fulfillmentVersion: 1,
        projectionHash: 'd'.repeat(64),
        admissionState: 'released',
        commercialState: 'open',
        displayReference: `COMMIT-ROUTE-${String(index + 1)}`,
        locationId,
        revisionAt: shiftStartsAt,
        phase: 'production_released',
        estimatedWeightLbs: weights[index] ?? weights[0],
        estimatedWeightSource: 'test_estimate',
        dueAt: shiftEndsAt,
        createdAt: shiftStartsAt,
        updatedAt: shiftStartsAt,
      })),
    );

  const productionOrderIds = [
    ids.sourceOrder,
    ids.sourceAnchorOrder,
    ids.earlyTargetOrder,
    ids.lateTargetOrder,
  ] as const;
  const resolved = fixture === 'resolved_order';
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values(
      productionOrderIds.map((id, index) => ({
        id,
        orderDemandId: ids.demands[index] ?? ids.demands[0]!,
        locationId,
        dueAt: shiftEndsAt,
        operationalStatus: 'scheduled',
        executionStatus: 'scheduled',
        resolutionState:
          index === 0 && resolved ? 'resolved_without_production' : 'open',
        resolvedAt: index === 0 && resolved ? shiftStartsAt : null,
        resolvedBy: index === 0 && resolved ? ids.actor : null,
        resolutionReason:
          index === 0 && resolved ? 'processor_not_in_use' : null,
        resolutionNote: null,
        derivedWeightLbs: weights[index] ?? weights[0],
        derivedWeightSource: 'test_estimate',
        bagCount: 1,
        bagCountSource: 'operator_intake',
        intakeVersion: 1,
        version: index === 0 ? 3 : 1,
        eligibleAt: shiftStartsAt,
        createdAt: shiftStartsAt,
        updatedAt: shiftStartsAt,
      })),
    );
};

const seedExecution = async (
  database: PostgresDatabase,
  fixture: CommitOrderRouteConformanceFixture,
): Promise<void> => {
  const inFlight = fixture === 'in_flight';
  const soleSource = fixture === 'sole_source_order';
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.sourceBatch,
        locationId,
        productionRunId: ids.productionRun,
        sequenceIndex: 0,
        status: inFlight ? 'washing' : 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: soleSource ? 20 : 30,
        pulseMinutes: 60,
        plannedDoneAt: shiftEndsAt,
        startedAt: inFlight ? sourceBase : null,
        membershipFrozenAt: inFlight ? sourceBase : null,
        membershipFrozenBy: inFlight ? ids.actor : null,
        version: 2,
        createdAt: shiftStartsAt,
        updatedAt: shiftStartsAt,
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
        plannedDoneAt: shiftEndsAt,
        version: 5,
        createdAt: shiftStartsAt,
        updatedAt: shiftStartsAt,
      },
      {
        id: ids.lateTargetBatch,
        locationId,
        productionRunId: ids.productionRun,
        sequenceIndex: 2,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 40,
        pulseMinutes: 60,
        plannedDoneAt: shiftEndsAt,
        version: 6,
        createdAt: shiftStartsAt,
        updatedAt: shiftStartsAt,
      },
    ]);

  const memberships = [
    {
      id: initialIds.memberships[0]!,
      locationId,
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.sourceOrder,
      placementProvenance: 'initial_schedule',
      placedAt: shiftStartsAt,
      placedBy: ids.actor,
    },
    ...(soleSource
      ? []
      : [
          {
            id: initialIds.memberships[1]!,
            locationId,
            productionBatchId: ids.sourceBatch,
            productionOrderId: ids.sourceAnchorOrder,
            placementProvenance: 'initial_schedule',
            placedAt: shiftStartsAt,
            placedBy: ids.actor,
          },
        ]),
    {
      id: initialIds.memberships[2]!,
      locationId,
      productionBatchId: ids.earlyTargetBatch,
      productionOrderId: ids.earlyTargetOrder,
      placementProvenance: 'initial_schedule',
      placedAt: shiftStartsAt,
      placedBy: ids.actor,
    },
    {
      id: initialIds.memberships[3]!,
      locationId,
      productionBatchId: ids.lateTargetBatch,
      productionOrderId: ids.lateTargetOrder,
      placementProvenance: 'initial_schedule',
      placedAt: shiftStartsAt,
      placedBy: ids.actor,
    },
  ];
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values(memberships);

  const stageSets = [
    [ids.sourceBatch, ids.sourceStages, sourceBase],
    [ids.earlyTargetBatch, ids.earlyTargetStages, earlyTargetBase],
    [ids.lateTargetBatch, ids.lateTargetStages, lateTargetBase],
  ] as const;
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(
      stageSets.flatMap(([productionBatchId, stageIds, base]) =>
        stages.map((stage) => {
          const window = windowFor(base, stage);
          const sourceStage = productionBatchId === ids.sourceBatch;
          const completed = inFlight && sourceStage && stage === 'sorting';
          const started = inFlight && sourceStage && stage === 'washing';
          return {
            id: stageIds[stage],
            locationId,
            productionBatchId,
            stationId: stationFor(stage),
            stageKind: stage,
            status: completed
              ? ('completed' as const)
              : started
                ? ('started' as const)
                : ('planned' as const),
            plannedStartAt: window.start,
            plannedEndAt: window.end,
            actualStartAt: completed || started ? sourceBase : null,
            actualEndAt: completed ? window.end : null,
            actualStartProvenance:
              completed || started
                ? ('live_observed' as const)
                : ('not_recorded' as const),
            actualEndProvenance: completed
              ? ('live_observed' as const)
              : ('not_recorded' as const),
            startedBy: completed || started ? ids.actor : null,
            completedBy: completed ? ids.actor : null,
            version: completed ? 3 : started ? 2 : 1,
            createdAt: shiftStartsAt,
            updatedAt: shiftStartsAt,
          };
        }),
      ),
    );

  const orderRoutes = [
    [ids.sourceOrder, ids.sourceStages],
    [ids.sourceAnchorOrder, ids.sourceStages],
    [ids.earlyTargetOrder, ids.earlyTargetStages],
    [ids.lateTargetOrder, ids.lateTargetStages],
  ] as const;
  let attemptIndex = 0;
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .values(
      orderRoutes.flatMap(([productionOrderId, stageIds]) =>
        stages.map((stage) => {
          const sourceAttempt = productionOrderId === ids.sourceOrder;
          const completed = inFlight && sourceAttempt && stage === 'sorting';
          const id = initialIds.attempts[attemptIndex++]!;
          return {
            id,
            locationId,
            productionRunId: ids.productionRun,
            productionOrderId,
            stageRunId: stageIds[stage],
            stageKind: stage,
            attemptNumber: 1,
            status: completed ? 'completed' : 'assigned',
            assignmentReason: 'initial_schedule',
            assignedAt: shiftStartsAt,
            assignedBy: ids.actor,
            completedAt: completed ? sourceBase : null,
            completedBy: completed ? ids.actor : null,
            createdAt: shiftStartsAt,
            updatedAt: shiftStartsAt,
          };
        }),
      ),
    );

  let assignmentIndex = 0;
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values(
      stageSets.flatMap(([, stageIds, base]) =>
        (['washing', 'drying'] as const).map((stage) => {
          const window = windowFor(base, stage);
          return {
            id: initialIds.assignments[assignmentIndex++]!,
            locationId,
            stageRunId: stageIds[stage],
            machineId: stage === 'washing' ? ids.washer : ids.dryer,
            plannedStartAt: window.start,
            plannedEndAt: window.end,
            status:
              inFlight && stageIds === ids.sourceStages && stage === 'washing'
                ? 'active'
                : 'planned',
            actualStartAt:
              inFlight && stageIds === ids.sourceStages && stage === 'washing'
                ? sourceBase
                : null,
            createdAt: shiftStartsAt,
            updatedAt: shiftStartsAt,
          };
        }),
      ),
    );
};

export const seedCommitOrderRouteConformance = async (
  database: PostgresDatabase,
  fixture: CommitOrderRouteConformanceFixture,
): Promise<void> => {
  await seedBoundary(database);
  await seedPlan(database, fixture);
  await seedOrders(database, fixture);
  await seedExecution(database, fixture);
};

export const applyCommitOrderRouteConformanceMutation = async (
  database: PostgresDatabase,
  mutation: CommitOrderRouteConformanceMutation,
): Promise<void> => {
  if (mutation === 'none') return;
  if (mutation === 'target_version') {
    await database
      .update(presslyPostgresOwnerSchemas.production.productionBatches)
      .set({ version: 7 })
      .where(
        eq(
          presslyPostgresOwnerSchemas.production.productionBatches.id,
          ids.lateTargetBatch,
        ),
      );
    return;
  }

  await database
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values({
      id: ids.routedEvent,
      locationId,
      eventType: 'fixture',
      entityType: 'fixture',
      entityId: ids.routedEvent,
      actorId: ids.actor,
      expectedVersion: null,
      idempotencyKey: 'commit-route-receipt-collision-fixture',
      payload: {},
      createdAt: shiftStartsAt,
    });
};

export const makeCommitOrderRouteConformanceIds = (): IdSource => {
  const values = [ids.routedMembership, ...ids.routedAttempts, ids.routedEvent];
  let index = 0;
  return { next: () => values[index++] ?? ids.routedEvent };
};

export const readCommitOrderRouteConformanceState = async (
  database: PostgresDatabase,
) => {
  const [
    locations,
    shifts,
    runs,
    productionOrders,
    batches,
    memberships,
    stageRuns,
    assignments,
    attempts,
    events,
  ] = await Promise.all([
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionLocations)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.productionLocations.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShifts)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionShifts.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatches)
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.productionBatches
            .sequenceIndex,
        ),
        asc(presslyPostgresOwnerSchemas.production.productionBatches.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatchOrders)
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.productionBatchOrders
            .productionOrderId,
        ),
        asc(
          presslyPostgresOwnerSchemas.production.productionBatchOrders.placedAt,
        ),
        asc(presslyPostgresOwnerSchemas.production.productionBatchOrders.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageRuns)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.stageRuns.plannedStartAt),
        asc(presslyPostgresOwnerSchemas.production.stageRuns.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.stageMachineAssignments
            .stageRunId,
        ),
        asc(presslyPostgresOwnerSchemas.production.stageMachineAssignments.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
            .productionOrderId,
        ),
        asc(
          presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
            .stageKind,
        ),
        asc(
          presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
            .attemptNumber,
        ),
        asc(
          presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
            .id,
        ),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.workEvents)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.workEvents.createdAt),
        asc(presslyPostgresOwnerSchemas.production.workEvents.id),
      ),
  ]);

  return Object.freeze({
    locations,
    shifts,
    runs,
    productionOrders,
    batches,
    memberships,
    stageRuns,
    assignments,
    attempts,
    events,
  });
};
