import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import {
  previewOrderBacklogFixtureIds as ids,
  previewOrderBacklogGeneratedAt,
  previewOrderBacklogLocationId as locationId,
  previewOrderBacklogSiblingLocationId as siblingLocationId,
  type PreviewOrderBacklogFixture,
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
  'production_shift_selected_orders',
  'production_shift_selections',
  'schedule_runs',
  'scheduler_configs',
  'production_stations',
  'production_orders',
  'order_demands',
  'production_shifts',
  'production_locations',
] as const;

export const createPreviewOrderBacklogConformanceDatabase =
  (): TestDatabaseRuntime =>
    createTestDatabaseRuntime({
      databaseUrl: getTestDatabaseUrl(
        'PRESSLY_TEST_DATABASE_URL',
        'postgres://pressly:pressly@localhost:55434/pressly_preview_order_backlog_conformance_test',
      ),
      tableNames: tables,
      maxConnections: 2,
      ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
        ? {}
        : {
            resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
          }),
    });

const uuid = (suffix: number, prefix: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const cutoff = new Date('2026-08-01T00:00:00.000Z');
const baseDueAt = new Date('2026-07-01T12:00:00.000Z');

type SeedOrder = Readonly<{
  productionOrderId: string;
  ordinal: number;
  dueAt?: Date;
  location?: string;
  displayReference?: string;
  production?: Partial<
    typeof presslyPostgresOwnerSchemas.production.productionOrders.$inferInsert
  >;
}>;

const seedLocationRoots = async (database: PostgresDatabase): Promise<void> => {
  await seedProductionLocationConformanceFacts(database, [
    {
      id: locationId,
      businessId: ids.business,
      name: 'Preview Backlog Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId: ids.business,
      name: 'Sibling Preview Backlog Facility',
      timezone: 'America/Chicago',
    },
  ]);
};

const seedOrder = async (
  database: PostgresDatabase,
  input: SeedOrder,
): Promise<void> => {
  const location = input.location ?? locationId;
  const dueAt = input.dueAt ?? baseDueAt;
  const fulfillmentId = uuid(input.ordinal, 74200000);
  const demandId = uuid(input.ordinal, 74300000);
  const displayReference =
    input.displayReference ?? `ORDER-${String(input.ordinal)}`;
  await database
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: demandId,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'unreleased',
      commercialState: 'open',
      displayReference,
      locationId: location,
      revisionAt: dueAt,
      phase: 'expected',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'test',
      dueAt,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: input.productionOrderId,
      orderDemandId: demandId,
      locationId: location,
      dueAt,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 20,
      version: input.ordinal,
      ...input.production,
    });
};

const seedPlanningEvidence = async (
  database: PostgresDatabase,
): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values({
      id: ids.shift,
      locationId,
      startsAt: new Date('2026-08-22T14:00:00.000Z'),
      endsAt: new Date('2026-08-22T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'draft',
      effectiveFolderCount: 2,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values({
      id: ids.config,
      locationId,
      pulseMinutes: 45,
      foldLbsPerFolderMinute: 1,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      version: 1,
      stageFitAssertion: {},
      assertedBy: ids.actor,
      publishedAt: previewOrderBacklogGeneratedAt,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values({
      id: ids.schedule,
      locationId,
      productionShiftId: ids.shift,
      schedulerConfigId: ids.config,
      status: 'draft',
      inputSnapshot: {
        orders: [
          { id: ids.participant },
          { id: ids.selectedSnapshot, recorded: true },
        ],
      },
      inputSnapshotHash: 'schedule-input',
      outputPlan: {},
      outputPlanHash: 'schedule-output',
      algorithmVersion: 'fixed-pulse-ffd-v1',
      pulseCapacityLbs: 100,
      batchCount: 1,
      makespanMinutes: 45,
      plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: ids.run,
      locationId,
      productionShiftId: ids.shift,
      scheduleRunId: ids.schedule,
      status: 'started',
      startedAt: new Date('2026-08-22T14:00:00.000Z'),
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values({
      id: ids.batch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 20,
      pulseMinutes: 45,
      plannedDoneAt: new Date('2026-08-22T19:00:00.000Z'),
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values({
      id: ids.station,
      locationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values({
      id: ids.stage,
      locationId,
      productionBatchId: ids.batch,
      stationId: ids.station,
      stageKind: 'sorting',
      status: 'planned',
      plannedStartAt: new Date('2026-08-22T14:00:00.000Z'),
      plannedEndAt: new Date('2026-08-22T14:15:00.000Z'),
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values({
      id: ids.membership,
      locationId,
      productionBatchId: ids.batch,
      productionOrderId: ids.participant,
      active: false,
      placementProvenance: 'automatic',
      placedAt: new Date('2026-08-22T13:30:00.000Z'),
      placedBy: ids.actor,
      releasedAt: new Date('2026-08-22T13:40:00.000Z'),
      releasedBy: ids.actor,
      releaseReason: 'other',
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
    .values({
      id: ids.attempt,
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.participant,
      stageRunId: ids.stage,
      stageKind: 'sorting',
      attemptNumber: 1,
      status: 'released',
      assignmentReason: 'initial_schedule',
      assignedAt: new Date('2026-08-22T13:30:00.000Z'),
      assignedBy: ids.actor,
      releasedAt: new Date('2026-08-22T13:40:00.000Z'),
      releasedBy: ids.actor,
      releaseReason: 'other',
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShiftSelections)
    .values({
      productionShiftId: ids.shift,
      locationId,
      version: 1,
      selectedBy: ids.actor,
      selectedAt: new Date('2026-08-22T13:00:00.000Z'),
    });
  await database
    .insert(
      presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
    )
    .values({
      productionShiftId: ids.shift,
      locationId,
      productionOrderId: ids.participant,
      selectedBy: ids.actor,
      selectedAt: new Date('2026-08-22T13:00:00.000Z'),
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values([
      {
        id: ids.routeEvent,
        locationId,
        eventType: 'production_order_route_exception_recorded',
        entityType: 'production_order',
        entityId: ids.participant,
        actorId: ids.actor,
        expectedVersion: 1,
        idempotencyKey: 'preview-backlog-route-event',
        payload: {},
        createdAt: previewOrderBacklogGeneratedAt,
      },
      {
        id: ids.selectionEvent,
        locationId,
        eventType: 'production_shift_selection_replaced',
        entityType: 'production_shift',
        entityId: ids.shift,
        actorId: ids.actor,
        expectedVersion: 1,
        idempotencyKey: 'preview-backlog-selection-event',
        payload: { selectedOrderIds: [ids.selectedEvent] },
        createdAt: previewOrderBacklogGeneratedAt,
      },
    ]);
};

const seedPagination = async (database: PostgresDatabase): Promise<void> => {
  await seedOrder(database, { productionOrderId: ids.readyA, ordinal: 1 });
  await seedOrder(database, { productionOrderId: ids.readyB, ordinal: 2 });
  await seedOrder(database, {
    productionOrderId: ids.review,
    ordinal: 3,
    dueAt: baseDueAt,
  });
};

const seedCompleteSafetyGraph = async (
  database: PostgresDatabase,
): Promise<void> => {
  await seedOrder(database, {
    productionOrderId: ids.readyA,
    ordinal: 1,
    displayReference: 'READY-A',
  });
  await seedOrder(database, {
    productionOrderId: ids.readyB,
    ordinal: 2,
    displayReference: 'READY-B',
  });
  await seedOrder(database, {
    productionOrderId: ids.review,
    ordinal: 3,
    dueAt: new Date('2026-07-02T12:00:00.000Z'),
    displayReference: 'REVIEW',
    production: {
      intakeVersion: 1,
      intakeRecordedAt: new Date('2026-07-02T12:00:00.000Z'),
      bagCount: 2,
      bagCountSource: 'operator_intake',
      admissionOverride: 'released',
      admissionOverrideAt: new Date('2026-07-02T12:00:00.000Z'),
      admissionOverrideBy: ids.actor,
      priority: true,
      pendingPlacement: { reason: 'manager_review' },
    },
  });
  await seedOrder(database, {
    productionOrderId: ids.participant,
    ordinal: 4,
    dueAt: new Date('2026-07-03T12:00:00.000Z'),
    displayReference: 'PARTICIPANT',
    production: {
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
    },
  });
  await seedOrder(database, {
    productionOrderId: ids.selectedSnapshot,
    ordinal: 5,
    dueAt: new Date('2026-07-04T12:00:00.000Z'),
    displayReference: 'SNAPSHOT-SELECTED',
  });
  await seedOrder(database, {
    productionOrderId: ids.selectedEvent,
    ordinal: 6,
    dueAt: new Date('2026-07-05T12:00:00.000Z'),
    displayReference: 'EVENT-SELECTED',
  });
  await seedOrder(database, {
    productionOrderId: ids.resolved,
    ordinal: 7,
    dueAt: new Date('2026-07-06T12:00:00.000Z'),
    displayReference: 'RESOLVED',
    production: {
      resolutionState: 'resolved_without_production',
      resolvedAt: new Date('2026-07-07T12:00:00.000Z'),
      resolvedBy: ids.actor,
      resolutionReason: 'processor_not_in_use',
    },
  });
  await seedOrder(database, {
    productionOrderId: ids.finished,
    ordinal: 8,
    dueAt: new Date('2026-07-07T12:00:00.000Z'),
    displayReference: 'FINISHED',
    production: {
      operationalStatus: 'finished',
      executionStatus: 'finished',
      finishedAt: new Date('2026-07-08T12:00:00.000Z'),
    },
  });
  await seedOrder(database, {
    productionOrderId: ids.afterCutoff,
    ordinal: 9,
    dueAt: new Date(cutoff.getTime() + 1),
    displayReference: 'AFTER-CUTOFF',
  });
  await seedOrder(database, {
    productionOrderId: ids.sibling,
    ordinal: 10,
    location: siblingLocationId,
    dueAt: baseDueAt,
    displayReference: 'SIBLING',
  });
  await seedOrder(database, {
    productionOrderId: ids.atCutoff,
    ordinal: 11,
    dueAt: cutoff,
    displayReference: 'AT-CUTOFF',
  });
  await seedPlanningEvidence(database);
};

export const seedPreviewOrderBacklogConformance = async (
  database: PostgresDatabase,
  fixture: PreviewOrderBacklogFixture,
): Promise<void> => {
  await seedLocationRoots(database);
  if (fixture === 'location-roots') return;
  if (fixture === 'pagination') return seedPagination(database);
  return seedCompleteSafetyGraph(database);
};

export const readPreviewOrderBacklogState = async (
  database: PostgresDatabase,
) => {
  const [
    locations,
    demands,
    productionOrders,
    shifts,
    selections,
    selectedOrders,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    stations,
    stages,
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
      .from(presslyPostgresOwnerSchemas.production.orderDemands)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.orderDemands.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShifts)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionShifts.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShiftSelections)
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.productionShiftSelections
            .productionShiftId,
        ),
      ),
    database
      .select()
      .from(
        presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
      )
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders
            .productionShiftId,
        ),
        asc(
          presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders
            .productionOrderId,
        ),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.schedulerConfigs)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.schedulerConfigs.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.scheduleRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.scheduleRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatches)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.productionBatches.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatchOrders)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.productionBatchOrders.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stations)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.stations.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageRuns)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.stageRuns.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.production.stageMachineAssignments.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrderStageAttempts)
      .orderBy(
        asc(
          presslyPostgresOwnerSchemas.production.productionOrderStageAttempts
            .id,
        ),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.workEvents)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.workEvents.id)),
  ]);
  return {
    locations,
    demands,
    productionOrders,
    shifts,
    selections,
    selectedOrders,
    configs,
    schedules,
    runs,
    batches,
    memberships,
    stations,
    stages,
    assignments,
    attempts,
    events,
  };
};

export type PreviewOrderBacklogReadState = Awaited<
  ReturnType<typeof readPreviewOrderBacklogState>
>;
