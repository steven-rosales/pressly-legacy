import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { eq, sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { listHistoryActivityContract } from '@pressly/production-system/operations/history/list-activity/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { ListHistoryActivityInput } from '@pressly/production-system/operations/history/list-activity/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  captureListHistoryActivityOutcome,
  listHistoryActivityAsOf,
  listHistoryActivityBoundaryLocationId,
  listHistoryActivityConformanceScenarios,
  listHistoryActivityIds as ids,
  listHistoryActivityLocationId,
  listHistoryActivityNextCursor,
  listHistoryActivitySiblingLocationId,
  runListHistoryActivityConformanceScenario,
  type CanonicalListHistoryActivityOutcome,
  type ListHistoryActivityConformanceScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from './support/production-location-conformance.postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_list_history_activity_conformance_test',
  ),
  tableNames: [
    'stage_machine_assignments',
    'production_order_stage_attempts',
    'work_events',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'schedule_runs',
    'scheduler_configs',
    'production_stations',
    'production_orders',
    'order_demands',
    'production_shifts',
    'auth_identities',
    'production_locations',
    'access_production_locations',
    'business_accounts',
  ],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
afterAll(database.close);

const systemActorId = '00000000-0000-4000-8000-000000000000';
const uuid = (suffix: number, prefix = 32100000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

type WorkEventSeed = Readonly<{
  id: string;
  locationId?: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId?: string;
  expectedVersion?: number;
  payload?: Record<string, unknown>;
  createdAt: string;
}>;

const event = (input: WorkEventSeed) => ({
  id: input.id,
  locationId: input.locationId ?? listHistoryActivityLocationId,
  eventType: input.eventType,
  entityType: input.entityType,
  entityId: input.entityId,
  actorId: input.actorId ?? ids.actor,
  idempotencyKey: `history-activity-conformance-${input.id}`,
  payload: input.payload ?? {},
  createdAt: new Date(input.createdAt),
  ...(input.expectedVersion === undefined
    ? {}
    : { expectedVersion: input.expectedVersion }),
});

const seedLocationsAndActors = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: ids.business,
      slug: 'history-activity-conformance',
      displayName: 'History Activity Conformance',
    });
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: listHistoryActivityLocationId,
      businessId: ids.business,
      name: 'History Activity Main',
      timezone: 'America/New_York',
      liveRevision: 11,
    },
    {
      id: listHistoryActivitySiblingLocationId,
      businessId: ids.business,
      name: 'History Activity Sibling',
      timezone: 'America/Chicago',
      liveRevision: 7,
    },
    {
      id: listHistoryActivityBoundaryLocationId,
      businessId: ids.business,
      name: 'History Activity Boundary',
      timezone: 'America/Los_Angeles',
      liveRevision: 3,
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values([
      {
        id: listHistoryActivityLocationId,
        businessId: ids.business,
        name: 'History Activity Main',
        timezone: 'America/New_York',
      },
      {
        id: listHistoryActivitySiblingLocationId,
        businessId: ids.business,
        name: 'History Activity Sibling',
        timezone: 'America/Chicago',
      },
      {
        id: listHistoryActivityBoundaryLocationId,
        businessId: ids.business,
        name: 'History Activity Boundary',
        timezone: 'America/Los_Angeles',
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.authIdentities)
    .values({
      id: ids.actor,
      kind: 'human',
      displayName: '  Alex Operator  ',
      email: 'history-activity-conformance@example.com',
      emailNormalized: 'history-activity-conformance@example.com',
    });
};

const scheduleRun = (input: {
  id: string;
  locationId: string;
  shiftId: string;
  configId: string;
  createdAt: Date;
}) => ({
  id: input.id,
  locationId: input.locationId,
  productionShiftId: input.shiftId,
  schedulerConfigId: input.configId,
  status: 'accepted' as const,
  inputSnapshot: {},
  inputSnapshotHash: 'a'.repeat(64),
  outputPlan: {},
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: 'fixed-pulse-ffd-v2',
  pulseCapacityLbs: 100,
  batchCount: 1,
  makespanMinutes: 224,
  plannedCompletionAt: new Date('2026-08-22T18:00:00.000Z'),
  warnings: [],
  acknowledgedWarningCodes: [],
  acceptedAt: input.createdAt,
  acceptedBy: ids.actor,
  createdAt: input.createdAt,
});

const seedHistoricalGraph = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values([
      {
        id: ids.shiftA,
        locationId: listHistoryActivityLocationId,
        startsAt: new Date('2026-08-21T08:00:00.000Z'),
        endsAt: new Date('2026-08-21T20:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'closed',
        effectiveFolderCount: 2,
      },
      {
        id: ids.shiftB,
        locationId: listHistoryActivityLocationId,
        startsAt: new Date('2026-08-22T08:00:00.000Z'),
        endsAt: new Date('2026-08-22T20:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 2,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values([
      {
        id: ids.configA,
        locationId: listHistoryActivityLocationId,
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
      },
      {
        id: ids.configB,
        locationId: listHistoryActivityLocationId,
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 2,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
        assertedBy: ids.actor,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values([
      scheduleRun({
        id: ids.scheduleA,
        locationId: listHistoryActivityLocationId,
        shiftId: ids.shiftA,
        configId: ids.configA,
        createdAt: new Date('2026-08-21T07:00:00.000Z'),
      }),
      scheduleRun({
        id: ids.scheduleB,
        locationId: listHistoryActivityLocationId,
        shiftId: ids.shiftB,
        configId: ids.configB,
        createdAt: new Date('2026-08-22T07:00:00.000Z'),
      }),
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values([
      {
        id: ids.runA,
        locationId: listHistoryActivityLocationId,
        productionShiftId: ids.shiftA,
        scheduleRunId: ids.scheduleA,
        status: 'completed',
        startedAt: new Date('2026-08-21T08:00:00.000Z'),
        completedAt: new Date('2026-08-21T19:00:00.000Z'),
        queueVersion: 2,
        plannedCompletionAt: new Date('2026-08-21T18:00:00.000Z'),
        version: 2,
        createdAt: new Date('2026-08-21T07:30:00.000Z'),
      },
      {
        id: ids.runB,
        locationId: listHistoryActivityLocationId,
        productionShiftId: ids.shiftB,
        scheduleRunId: ids.scheduleB,
        status: 'started',
        startedAt: new Date('2026-08-22T08:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-22T18:00:00.000Z'),
        createdAt: new Date('2026-08-22T07:30:00.000Z'),
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.batchA,
        locationId: listHistoryActivityLocationId,
        productionRunId: ids.runA,
        sequenceIndex: 0,
        status: 'finished',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
        startedAt: new Date('2026-08-21T08:00:00.000Z'),
        finishedAt: new Date('2026-08-21T19:00:00.000Z'),
        membershipFrozenAt: new Date('2026-08-21T08:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        createdAt: new Date('2026-08-21T07:30:00.000Z'),
      },
      {
        id: ids.batchB,
        locationId: listHistoryActivityLocationId,
        productionRunId: ids.runB,
        sequenceIndex: 0,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-22T18:00:00.000Z'),
        createdAt: new Date('2026-08-22T07:30:00.000Z'),
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values({
      id: ids.station,
      locationId: listHistoryActivityLocationId,
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 0,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values([
      {
        id: ids.stageA,
        locationId: listHistoryActivityLocationId,
        productionBatchId: ids.batchA,
        stationId: ids.station,
        stageKind: 'sorting',
        status: 'completed',
        plannedStartAt: new Date('2026-08-21T08:00:00.000Z'),
        plannedEndAt: new Date('2026-08-21T09:00:00.000Z'),
        actualStartAt: new Date('2026-08-21T08:00:00.000Z'),
        actualEndAt: new Date('2026-08-21T09:00:00.000Z'),
        actualStartProvenance: 'live_observed',
        actualEndProvenance: 'live_observed',
      },
      {
        id: ids.stageB,
        locationId: listHistoryActivityLocationId,
        productionBatchId: ids.batchB,
        stationId: ids.station,
        stageKind: 'sorting',
        status: 'planned',
        plannedStartAt: new Date('2026-08-22T08:00:00.000Z'),
        plannedEndAt: new Date('2026-08-22T09:00:00.000Z'),
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: ids.demand,
      fulfillmentId: ids.fulfillment,
      fulfillmentVersion: 1,
      projectionHash: 'c'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: 'HISTORY-CONFORMANCE-ORDER',
      locationId: listHistoryActivityLocationId,
      revisionAt: new Date('2026-08-21T07:00:00.000Z'),
      phase: 'production_released',
      estimatedWeightLbs: 30,
      estimatedWeightSource: 'test_estimate',
      dueAt: listHistoryActivityAsOf,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: listHistoryActivityLocationId,
      dueAt: listHistoryActivityAsOf,
      priority: true,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'resolved_without_production',
      resolvedAt: new Date('2026-08-22T18:30:00.000Z'),
      resolvedBy: ids.actor,
      resolutionReason: 'completed_outside_pressly',
      derivedWeightLbs: 30,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      version: 7,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values([
      {
        id: ids.membershipA,
        locationId: listHistoryActivityLocationId,
        productionBatchId: ids.batchA,
        productionOrderId: ids.order,
        active: false,
        placementProvenance: 'initial_schedule',
        placedAt: new Date('2026-08-21T07:30:00.000Z'),
        placedBy: ids.actor,
        releasedAt: new Date('2026-08-21T19:00:00.000Z'),
        releasedBy: ids.actor,
        releaseReason: 'historical_episode_closed',
      },
      {
        id: ids.membershipB,
        locationId: listHistoryActivityLocationId,
        productionBatchId: ids.batchB,
        productionOrderId: ids.order,
        active: true,
        placementProvenance: 'automatic',
        placedAt: new Date('2026-08-22T07:30:00.000Z'),
        placedBy: ids.actor,
      },
    ]);
};

const seedActivity = async (): Promise<void> => {
  const baseEvents: readonly WorkEventSeed[] = [
    {
      id: ids.runAEvent,
      eventType: 'production_run_started',
      entityType: 'production_run',
      entityId: ids.runA,
      payload: {
        scheduleRunId: ids.scheduleA,
        productionBatchIds: [ids.batchA],
        queueVersion: 1,
      },
      createdAt: '2026-08-22T12:00:00.000Z',
    },
    {
      id: ids.batchAEvent,
      eventType: 'batch_membership_frozen',
      entityType: 'production_batch',
      entityId: ids.batchA,
      payload: { batchVersion: 2, queueVersion: 2 },
      createdAt: '2026-08-22T12:30:00.000Z',
    },
    {
      id: uuid(100),
      eventType: 'batch_membership_unfrozen',
      entityType: 'production_batch',
      entityId: ids.batchA,
      payload: { batchVersion: 3, queueVersion: 3 },
      createdAt: '2026-08-22T12:31:00.000Z',
    },
    {
      id: uuid(101),
      eventType: 'batch_progress_reconciled',
      entityType: 'production_batch',
      entityId: ids.batchA,
      payload: {
        currentMilestone: 'washing',
        targetMilestone: 'drying',
        reason: 'floor_recovery',
        queueVersion: 4,
        batchVersion: 4,
      },
      createdAt: '2026-08-22T12:32:00.000Z',
    },
    {
      id: ids.scheduleAEvent,
      eventType: 'schedule_accepted',
      entityType: 'schedule_run',
      entityId: ids.scheduleA,
      payload: {
        productionShiftId: ids.shiftA,
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
        acknowledgedWarningCodes: ['OVERTIME'],
      },
      createdAt: '2026-08-22T13:00:00.000Z',
    },
    {
      id: uuid(102),
      eventType: 'schedule_computed',
      entityType: 'schedule_run',
      entityId: ids.scheduleA,
      payload: {
        productionShiftId: ids.shiftA,
        inputSnapshotHash: 'a'.repeat(64),
        outputPlanHash: 'b'.repeat(64),
      },
      createdAt: '2026-08-22T13:01:00.000Z',
    },
    {
      id: ids.shiftAEvent,
      eventType: 'production_shift_updated',
      entityType: 'production_shift',
      entityId: ids.shiftA,
      payload: {
        changedFields: ['startsAt', 5, 'effectiveFolderCount'],
        supersededScheduleRunId: ids.scheduleB,
      },
      createdAt: '2026-08-22T14:00:00.000Z',
    },
    {
      id: uuid(103),
      eventType: 'production_shift_created',
      entityType: 'production_shift',
      entityId: ids.shiftA,
      payload: { changedFields: [] },
      createdAt: '2026-08-22T14:01:00.000Z',
    },
    {
      id: ids.demandEvent,
      eventType: 'order_demand_applied',
      entityType: 'order_demand',
      entityId: ids.demand,
      payload: { outcome: 'applied', privateSourcePayload: 'never-public' },
      createdAt: '2026-08-22T15:00:00.000Z',
    },
    {
      id: ids.orderEvent,
      eventType: 'production_order_priority_changed',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 6,
      payload: { priority: true, version: 7 },
      createdAt: '2026-08-22T16:00:00.000Z',
    },
    {
      id: uuid(104),
      eventType: 'production_order_intake_recorded',
      entityType: 'production_order',
      entityId: ids.order,
      payload: { bagCount: 1, version: 3 },
      createdAt: '2026-08-22T16:01:00.000Z',
    },
    {
      id: uuid(105),
      eventType: 'production_order_placement_pending',
      entityType: 'production_order',
      entityId: ids.order,
      payload: { outcome: 'pending', queueVersion: 2 },
      createdAt: '2026-08-22T16:02:00.000Z',
    },
    {
      id: uuid(106),
      eventType: 'production_order_placement_overtime_required',
      entityType: 'production_order',
      entityId: ids.order,
      payload: { outcome: 'overtime_required', queueVersion: 2 },
      createdAt: '2026-08-22T16:03:00.000Z',
    },
    {
      id: uuid(107),
      eventType: 'production_order_placement_resolved',
      entityType: 'production_order',
      entityId: ids.order,
      payload: { outcome: 'placed', targetBatchId: ids.batchB },
      createdAt: '2026-08-22T16:04:00.000Z',
    },
    {
      id: uuid(108),
      eventType: 'production_order_rebatched',
      entityType: 'production_order',
      entityId: ids.order,
      payload: {
        sourceProductionBatchId: ids.batchA,
        targetProductionBatchId: ids.batchB,
        reason: 'manual_rebatch',
      },
      createdAt: '2026-08-22T16:05:00.000Z',
    },
    {
      id: uuid(109),
      eventType: 'production_order_route_exception_recorded',
      entityType: 'production_order',
      entityId: ids.order,
      payload: {
        sourceBatchId: ids.batchA,
        targetBatchId: ids.batchB,
        reason: 'needs_more_drying',
        restartStage: 'drying',
        releasedStages: ['washing', 'not_a_stage'],
        assignedStages: ['drying', 'folding_packaging'],
      },
      createdAt: '2026-08-22T16:06:00.000Z',
    },
    {
      id: ids.stageAEvent,
      eventType: 'stage_completed',
      entityType: 'stage_run',
      entityId: ids.stageA,
      expectedVersion: 2,
      payload: { version: 3, earlyCompletion: { confirmed: true } },
      createdAt: '2026-08-22T18:00:00.000Z',
    },
    {
      id: uuid(110),
      eventType: 'machine_assigned',
      entityType: 'stage_run',
      entityId: ids.stageA,
      payload: { machineIds: [uuid(900), 'not-a-uuid'], version: 2 },
      createdAt: '2026-08-22T18:01:00.000Z',
    },
    {
      id: ids.archiveEvent,
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 6,
      payload: {
        action: 'resolve_without_production',
        resolutionState: 'resolved_without_production',
        reason: 'completed_outside_pressly',
        note: 'private manager note',
        _idempotency: { command: 'private command' },
        version: 7,
      },
      createdAt: '2026-08-22T18:30:00.000Z',
    },
    {
      id: ids.bulkArchiveEvent,
      eventType: 'production_order_bulk_resolved_without_production',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 6,
      payload: { action: 'resolve_without_production', version: 7 },
      createdAt: '2026-08-22T18:31:00.000Z',
    },
    {
      id: ids.restoreEvent,
      eventType: 'production_order_restored',
      entityType: 'production_order',
      entityId: ids.order,
      expectedVersion: 7,
      payload: {
        action: 'restore',
        reason: 'work_should_be_produced',
        version: 8,
      },
      createdAt: '2026-08-22T18:32:00.000Z',
    },
    {
      id: ids.resourceEvent,
      eventType: 'production_resources_bootstrapped',
      entityType: 'production_resource_manifest',
      entityId: ids.configA,
      actorId: systemActorId,
      payload: { version: 4, rawManifest: 'private' },
      createdAt: '2026-08-22T18:50:00.000Z',
    },
    {
      id: ids.configEvent,
      eventType: 'scheduler_config_published',
      entityType: 'scheduler_config',
      entityId: ids.configA,
      actorId: ids.unknownActor,
      payload: { version: 2 },
      createdAt: '2026-08-22T18:55:00.000Z',
    },
    {
      id: ids.systemEvent,
      eventType: 'production_shift_created',
      entityType: 'production_shift',
      entityId: ids.shiftB,
      actorId: systemActorId,
      payload: { changedFields: [] },
      createdAt: '2026-08-22T18:56:00.000Z',
    },
    {
      id: ids.unknownActorEvent,
      eventType: 'schedule_computed',
      entityType: 'schedule_run',
      entityId: ids.scheduleB,
      actorId: ids.unknownActor,
      payload: { productionShiftId: ids.shiftB },
      createdAt: '2026-08-22T18:57:00.000Z',
    },
    {
      id: ids.privateEvent,
      eventType: 'private_internal_event',
      entityType: 'production_run',
      entityId: ids.runA,
      payload: { rawPrivatePayload: 'never-public' },
      createdAt: '2026-08-22T19:15:00.000Z',
    },
    {
      id: ids.siblingEvent,
      locationId: listHistoryActivitySiblingLocationId,
      eventType: 'scheduler_config_published',
      entityType: 'scheduler_config',
      entityId: ids.configA,
      actorId: ids.unknownActor,
      payload: { version: 9 },
      createdAt: '2026-08-22T19:30:00.000Z',
    },
  ];
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values(baseEvents.map(event));

  const precisionEvents = [
    [ids.precisionOldest, '2026-08-22T19:45:00.000100Z'],
    [ids.precisionMiddle, '2026-08-22T19:45:00.000500Z'],
    [ids.precisionNewest, '2026-08-22T19:45:00.000900Z'],
  ] as const;
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values(
      precisionEvents.map(([id]) =>
        event({
          id,
          eventType: 'stage_started',
          entityType: 'stage_run',
          entityId: ids.stageA,
          payload: { version: 2, earlyStart: { confirmed: true } },
          createdAt: '2026-08-22T19:45:00.000Z',
        }),
      ),
    );
  for (const [id, createdAt] of precisionEvents)
    await database.db
      .update(presslyPostgresOwnerSchemas.production.workEvents)
      .set({ createdAt: sql<Date>`${createdAt}::timestamptz` })
      .where(eq(presslyPostgresOwnerSchemas.production.workEvents.id, id));

  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values(
      Array.from({ length: 101 }, (_, index) =>
        event({
          id: uuid(index + 1, 32300000),
          locationId: listHistoryActivityBoundaryLocationId,
          eventType: 'stage_started',
          entityType: 'stage_run',
          entityId: uuid(index + 201, 32300000),
          actorId: ids.unknownActor,
          payload: { version: 1 },
          createdAt: new Date(
            Date.parse('2026-08-22T17:00:00.000Z') + index,
          ).toISOString(),
        }),
      ),
    );
};

const seed = async (): Promise<void> => {
  await seedLocationsAndActors();
  await seedHistoricalGraph();
  await seedActivity();
};

const readCompleteState = async () => {
  const [
    businesses,
    identities,
    locations,
    shifts,
    configs,
    schedules,
    runs,
    batches,
    stages,
    demands,
    productionOrders,
    memberships,
    events,
  ] = await Promise.all([
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.access.businessAccounts),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.access.authIdentities),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.access.accessProductionLocations),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShifts),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.schedulerConfigs),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.scheduleRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatches),
    database.db.select().from(presslyPostgresOwnerSchemas.production.stageRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.orderDemands),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatchOrders),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.workEvents),
  ]);
  return {
    businesses,
    identities,
    locations,
    shifts,
    configs,
    schedules,
    runs,
    batches,
    stages,
    demands,
    productionOrders,
    memberships,
    events,
  };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];

type QueryTrace = Readonly<{
  timing: string[];
  options: TransactionOptions[];
  readOnly: string[];
  isolation: string[];
}>;

const observedDatabase = (trace: QueryTrace): PostgresDatabase => {
  const transaction = (async (
    callback: (transaction: PostgresTransaction) => Promise<unknown>,
    options: TransactionOptions,
  ) => {
    trace.timing.push('read');
    trace.options.push(options);
    return database.db.transaction(async (transaction) => {
      const readOnly = await transaction.execute(
        sql`show transaction_read_only`,
      );
      const isolation = await transaction.execute(
        sql`show transaction_isolation`,
      );
      const readOnlyRow = readOnly[0];
      const isolationRow = isolation[0];
      trace.readOnly.push(
        typeof readOnlyRow === 'object' &&
          readOnlyRow !== null &&
          'transaction_read_only' in readOnlyRow
          ? String(readOnlyRow['transaction_read_only'])
          : 'missing',
      );
      trace.isolation.push(
        typeof isolationRow === 'object' &&
          isolationRow !== null &&
          'transaction_isolation' in isolationRow
          ? String(isolationRow['transaction_isolation'])
          : 'missing',
      );
      return callback(transaction);
    }, options);
  }) as PostgresDatabase['transaction'];

  return new Proxy(database.db, {
    get: (target, property) => {
      if (property === 'transaction') return transaction;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const idsSource = (): IdSource => ({ next: () => uuid(999) });

const execute = (
  db: PostgresDatabase,
  trace: QueryTrace,
): ((input: ListHistoryActivityInput) => Promise<unknown>) => {
  const clock = {
    now: () => {
      trace.timing.push('clock');
      return new Date(listHistoryActivityAsOf);
    },
  };
  return makeProductionSystem({
    schema: presslyPostgresOwnerSchemas.production,
    productionActorReadV1: makeProductionActorReadV1Capability(
      database.db,
      presslyPostgresOwnerSchemas.access,
    ),
    productionScopeReconciliationV1:
      makeProductionScopeReconciliationV1Capability(
        database.db,
        presslyPostgresOwnerSchemas.access,
      ),
    db,
    ids: idsSource(),
    clock,
  }).cells.listHistoryActivity.execute;
};

type Observation = Readonly<{
  outcomes: readonly CanonicalListHistoryActivityOutcome[];
  before: Awaited<ReturnType<typeof readCompleteState>>;
  after: Awaited<ReturnType<typeof readCompleteState>>;
  trace: QueryTrace;
}>;

const observe = async (
  scenario: ListHistoryActivityConformanceScenario,
): Promise<Observation> => {
  await database.reset();
  await seed();
  const before = await readCompleteState();
  const trace: QueryTrace = {
    timing: [],
    options: [],
    readOnly: [],
    isolation: [],
  };
  const outcomes = await runListHistoryActivityConformanceScenario(
    execute(observedDatabase(trace), trace),
    scenario,
  );
  return { outcomes, before, after: await readCompleteState(), trace };
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const successValue = (
  outcome: CanonicalListHistoryActivityOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  return outcome?.kind === 'success' ? (record(outcome.value) ?? {}) : {};
};

const items = (
  outcome: CanonicalListHistoryActivityOutcome | undefined,
): readonly Readonly<Record<string, unknown>>[] => {
  const value = successValue(outcome)['items'];
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const entry = record(item);
        return entry === null ? [] : [entry];
      })
    : [];
};

const itemIds = (
  outcome: CanonicalListHistoryActivityOutcome | undefined,
): readonly unknown[] => items(outcome).map((item) => item['id']);

const assertReadProof = (observation: Observation): void => {
  expect(observation.after).toEqual(observation.before);
  expect(observation.trace.options).not.toHaveLength(0);
  expect(observation.trace.options).toEqual(
    observation.trace.options.map(() => ({
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })),
  );
  expect(observation.trace.readOnly).toEqual(
    observation.trace.readOnly.map(() => 'on'),
  );
  expect(observation.trace.isolation).toEqual(
    observation.trace.isolation.map(() => 'repeatable read'),
  );
  expect(observation.trace.timing).toEqual(
    observation.trace.options.flatMap(() => ['clock', 'read']),
  );
};

const cursorEnvelope = (
  outcome: CanonicalListHistoryActivityOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  const cursor = successValue(outcome)['nextCursor'];
  expect(typeof cursor).toBe('string');
  return typeof cursor === 'string'
    ? (record(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) ??
        {})
    : {};
};

describe('production.list-history-activity.v1 permanent PostgreSQL conformance', () => {
  it('preserves the exact strict serialized boundary and defaults', () => {
    expect(
      listHistoryActivityContract.input.decode({
        params: { locationId: listHistoryActivityLocationId },
        query: {},
      }),
    ).toEqual({
      kind: 'valid',
      value: { locationId: listHistoryActivityLocationId, limit: 50 },
    });
    expect(
      listHistoryActivityContract.input.decode({
        params: { locationId: listHistoryActivityLocationId },
        query: {
          limit: '100',
          search: '  Alex Operator  ',
          occurredAfter: '2026-08-22T18:30:00.000Z',
        },
      }),
    ).toEqual({
      kind: 'valid',
      value: {
        locationId: listHistoryActivityLocationId,
        limit: 100,
        search: 'Alex Operator',
        occurredAfter: new Date('2026-08-22T18:30:00.000Z'),
      },
    });
    for (const value of [
      {
        params: { locationId: listHistoryActivityLocationId },
        query: { limit: 101 },
      },
      {
        params: { locationId: listHistoryActivityLocationId, extra: true },
        query: {},
      },
      {
        params: { locationId: listHistoryActivityLocationId },
        query: { privateFilter: 'forbidden' },
      },
      {
        params: { locationId: listHistoryActivityLocationId },
        query: { runId: 'not-a-uuid' },
      },
      {
        params: { locationId: listHistoryActivityLocationId },
        query: { eventType: 'private_internal_event' },
      },
    ])
      expect(listHistoryActivityContract.input.decode(value)).toMatchObject({
        kind: 'invalid',
      });
  });

  it.each(listHistoryActivityConformanceScenarios)(
    '$name',
    async (scenario) => {
      const observation = await observe(scenario);
      assertReadProof(observation);

      if (scenario.name.startsWith('defaults')) {
        const resultItems = items(observation.outcomes[0]);
        expect(
          resultItems.some((item) => item['id'] === ids.privateEvent),
        ).toBe(false);
        expect(
          resultItems.find((item) => item['id'] === ids.resourceEvent),
        ).toMatchObject({
          actor: { id: systemActorId, kind: 'system', displayName: 'System' },
          details: { kind: 'configuration', version: 4 },
        });
        expect(
          resultItems.find((item) => item['id'] === ids.configEvent),
        ).toMatchObject({
          actor: {
            id: ids.unknownActor,
            kind: 'unknown',
            displayName: null,
          },
        });
        expect(
          resultItems.find((item) => item['id'] === ids.archiveEvent),
        ).toMatchObject({
          actor: {
            id: ids.actor,
            kind: 'user',
            displayName: 'Alex Operator',
          },
          resolutionAction: { action: 'restore', expectedVersion: 7 },
        });
        const serialized = JSON.stringify(
          successValue(observation.outcomes[0]),
        );
        for (const forbidden of [
          'private manager note',
          'private command',
          'privateSourcePayload',
          'rawPrivatePayload',
          'rawManifest',
          'history-activity-conformance@example.com',
          'displayNumber',
          'customerDisplayName',
          'canonical',
        ])
          expect(serialized).not.toContain(forbidden);
      }

      if (scenario.name.startsWith('all filters')) {
        const runScoped = items(observation.outcomes[0]);
        expect(
          runScoped
            .filter(
              (item) =>
                item['id'] === ids.orderEvent || item['id'] === ids.demandEvent,
            )
            .map((item) => item['productionRunId']),
        ).toEqual([ids.runA, ids.runA]);
        expect(itemIds(observation.outcomes[2])).toEqual([ids.stageAEvent]);
        expect(itemIds(observation.outcomes[3])).toEqual([
          ids.bulkArchiveEvent,
          ids.archiveEvent,
        ]);
        expect(itemIds(observation.outcomes[4])).toEqual([ids.restoreEvent]);
        expect(itemIds(observation.outcomes[5])).toEqual([ids.stageAEvent]);
        expect(itemIds(observation.outcomes[6])).toEqual([
          uuid(101),
          uuid(100),
          ids.batchAEvent,
        ]);
        expect(itemIds(observation.outcomes[7])).toEqual([
          uuid(103),
          ids.shiftAEvent,
        ]);
        expect(itemIds(observation.outcomes[10])).toEqual([ids.archiveEvent]);
        expect(itemIds(observation.outcomes[11])).toEqual([]);
      }

      if (scenario.name.startsWith('microsecond')) {
        expect(
          observation.outcomes.flatMap((outcome) => itemIds(outcome)),
        ).toEqual([
          ids.precisionNewest,
          ids.precisionMiddle,
          ids.precisionOldest,
        ]);
        expect(cursorEnvelope(observation.outcomes[0])).toMatchObject({
          version: 2,
          kind: 'activity',
          createdAtKey: '2026-08-22T19:45:00.000900Z',
          id: ids.precisionNewest,
        });
        expect(cursorEnvelope(observation.outcomes[1])).toMatchObject({
          version: 2,
          kind: 'activity',
          createdAtKey: '2026-08-22T19:45:00.000500Z',
          id: ids.precisionMiddle,
        });
      }

      if (scenario.name.startsWith('one-hundred')) {
        expect(observation.outcomes).toHaveLength(2);
        expect(items(observation.outcomes[0])).toHaveLength(100);
        expect(items(observation.outcomes[1])).toHaveLength(1);
        expect(
          new Set(observation.outcomes.flatMap((outcome) => itemIds(outcome)))
            .size,
        ).toBe(101);
      }

      if (scenario.name.startsWith('invalid cursor')) {
        expect(observation.outcomes[0]).toMatchObject({
          kind: 'failure',
          failure: { code: 'production_history_cursor_invalid' },
        });
        expect(observation.outcomes[1]).toMatchObject({
          kind: 'failure',
          failure: { code: 'production_location_not_found' },
        });
        expect(itemIds(observation.outcomes[2])).toEqual([ids.siblingEvent]);
      }
    },
  );

  it('binds every filter but deliberately excludes location and limit from cursor scope', async () => {
    const observeCursorScope = async () => {
      await database.reset();
      await seed();
      const before = await readCompleteState();
      const trace: QueryTrace = {
        timing: [],
        options: [],
        readOnly: [],
        isolation: [],
      };
      const executeQuery = execute(observedDatabase(trace), trace);
      const first = await captureListHistoryActivityOutcome(executeQuery, {
        locationId: listHistoryActivityLocationId,
        limit: 1,
      });
      const cursor = listHistoryActivityNextCursor(first);
      expect(cursor).not.toBeNull();
      const boundFilters: readonly Omit<
        ListHistoryActivityInput,
        'cursor' | 'locationId' | 'limit'
      >[] = [
        { runId: ids.runA },
        { entityType: 'stage_run' },
        { eventType: 'stage_started' },
        { orderResolution: 'archived' },
        { search: 'Alex Operator' },
        { occurredAfter: new Date('2026-08-22T18:00:00.000Z') },
      ];
      const mismatches: CanonicalListHistoryActivityOutcome[] = [];
      for (const filter of boundFilters)
        mismatches.push(
          await captureListHistoryActivityOutcome(executeQuery, {
            locationId: listHistoryActivityLocationId,
            limit: 1,
            ...(cursor === null ? {} : { cursor }),
            ...filter,
          }),
        );
      const limitIndependent = await captureListHistoryActivityOutcome(
        executeQuery,
        {
          locationId: listHistoryActivityLocationId,
          limit: 100,
          ...(cursor === null ? {} : { cursor }),
        },
      );
      const locationIndependent = await captureListHistoryActivityOutcome(
        executeQuery,
        {
          locationId: listHistoryActivitySiblingLocationId,
          limit: 100,
          ...(cursor === null ? {} : { cursor }),
        },
      );
      const observation: Observation = {
        outcomes: [first, ...mismatches, limitIndependent, locationIndependent],
        before,
        after: await readCompleteState(),
        trace,
      };
      return observation;
    };

    const observation = await observeCursorScope();
    assertReadProof(observation);
    for (const mismatch of observation.outcomes.slice(1, 7))
      expect(mismatch).toMatchObject({
        kind: 'failure',
        failure: { code: 'production_history_cursor_invalid' },
      });
    expect(observation.outcomes[7]?.kind).toBe('success');
    expect(itemIds(observation.outcomes[8])).toEqual([ids.siblingEvent]);
  });
});
