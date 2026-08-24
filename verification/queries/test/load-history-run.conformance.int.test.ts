import {
  makeProductionActorReadV1Capability,
  makeProductionScopeReconciliationV1Capability,
} from '@pressly/access-system/assembly/production-capabilities';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { loadHistoryRunContract } from '@pressly/production-system/operations/history/load-run/contract';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { LoadHistoryRunInput } from '@pressly/production-system/operations/history/load-run/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadHistoryRunAsOf,
  loadHistoryRunBoundaryLocationId,
  loadHistoryRunConformanceScenarios,
  loadHistoryRunIds as ids,
  loadHistoryRunLocationId,
  loadHistoryRunSiblingLocationId,
  runLoadHistoryRunConformanceScenario,
  type CanonicalLoadHistoryRunOutcome,
  type LoadHistoryRunConformanceScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from './support/production-location-conformance.postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_load_history_run_conformance_test',
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
    'production_machines',
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
const uuid = (suffix: number, prefix = 33100000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const stageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;
const stageId = (batch: 0 | 1, stage: number): string =>
  uuid(batch * 10 + stage + 1, 33200000);

const seedLocationsAndActors = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: ids.business,
      slug: 'load-history-run-conformance',
      displayName: 'Load History Run Conformance',
    });
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: loadHistoryRunLocationId,
      businessId: ids.business,
      name: 'History Run Main',
      timezone: 'America/New_York',
      liveRevision: 17,
    },
    {
      id: loadHistoryRunSiblingLocationId,
      businessId: ids.business,
      name: 'History Run Sibling',
      timezone: 'America/Chicago',
      liveRevision: 9,
    },
    {
      id: loadHistoryRunBoundaryLocationId,
      businessId: ids.business,
      name: 'History Run Boundary',
      timezone: 'America/Los_Angeles',
      liveRevision: 4,
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values([
      {
        id: loadHistoryRunLocationId,
        businessId: ids.business,
        name: 'History Run Main',
        timezone: 'America/New_York',
      },
      {
        id: loadHistoryRunSiblingLocationId,
        businessId: ids.business,
        name: 'History Run Sibling',
        timezone: 'America/Chicago',
      },
      {
        id: loadHistoryRunBoundaryLocationId,
        businessId: ids.business,
        name: 'History Run Boundary',
        timezone: 'America/Los_Angeles',
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.access.authIdentities)
    .values({
      id: ids.actor,
      kind: 'human',
      displayName: '  Alex Historian  ',
      email: 'load-history-run-conformance@example.com',
      emailNormalized: 'load-history-run-conformance@example.com',
    });
};

const locationForShift = (shiftId: string): string =>
  shiftId === ids.siblingShift
    ? loadHistoryRunSiblingLocationId
    : shiftId === ids.boundaryShift
      ? loadHistoryRunBoundaryLocationId
      : loadHistoryRunLocationId;

const seedShiftsAndConfigs = async (): Promise<void> => {
  const shifts = [
    [ids.shiftA, '2026-08-21T12:00:00.000Z', '2026-08-21T22:00:00.000Z'],
    [ids.shiftB, '2026-08-22T12:00:00.000Z', '2026-08-22T22:00:00.000Z'],
    [ids.siblingShift, '2026-08-22T12:00:00.000Z', '2026-08-22T22:00:00.000Z'],
    [ids.boundaryShift, '2026-08-22T12:00:00.000Z', '2026-08-22T22:00:00.000Z'],
  ] as const;
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values(
      shifts.map(([shiftId, startsAt, endsAt]) => ({
        id: shiftId,
        locationId: locationForShift(shiftId),
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        timezone:
          shiftId === ids.siblingShift
            ? 'America/Chicago'
            : shiftId === ids.boundaryShift
              ? 'America/Los_Angeles'
              : 'America/New_York',
        status: 'open',
        effectiveFolderCount: 2,
        version: 1,
      })),
    );
  const configs = [
    [ids.configA, loadHistoryRunLocationId, 1],
    [ids.configB, loadHistoryRunLocationId, 2],
    [ids.siblingConfig, loadHistoryRunSiblingLocationId, 1],
    [ids.boundaryConfig, loadHistoryRunBoundaryLocationId, 1],
  ] as const;
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values(
      configs.map(([configId, locationId, version]) => ({
        id: configId,
        locationId,
        pulseMinutes: 56,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
        },
        assertedBy: ids.actor,
      })),
    );
};

const schedule = (input: {
  id: string;
  locationId: string;
  shiftId: string;
  configId: string;
  status: 'accepted' | 'superseded' | 'rejected';
  createdAt: Date;
  warnings?: readonly Readonly<{ code: string }>[];
}) => ({
  id: input.id,
  locationId: input.locationId,
  productionShiftId: input.shiftId,
  schedulerConfigId: input.configId,
  status: input.status,
  inputSnapshot: {},
  inputSnapshotHash: 'a'.repeat(64),
  outputPlan: {},
  outputPlanHash: 'b'.repeat(64),
  algorithmVersion: `history-${input.id}`,
  pulseCapacityLbs: 100,
  batchCount: input.shiftId === ids.shiftA ? 2 : 1,
  makespanMinutes: 224,
  plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
  warnings: [...(input.warnings ?? [])],
  acknowledgedWarningCodes:
    input.status === 'accepted' && (input.warnings?.length ?? 0) > 0
      ? [input.warnings?.[0]?.code ?? '']
      : [],
  acceptedAt:
    input.status === 'accepted'
      ? new Date(input.createdAt.getTime() + 60_000)
      : input.status === 'superseded'
        ? new Date(input.createdAt.getTime() + 60_000)
        : null,
  acceptedBy:
    input.status === 'accepted' || input.status === 'superseded'
      ? ids.actor
      : null,
  supersededAt:
    input.status === 'superseded'
      ? new Date(input.createdAt.getTime() + 120_000)
      : null,
  createdAt: input.createdAt,
});

const seedSchedulesAndRuns = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values([
      schedule({
        id: ids.oldScheduleA,
        locationId: loadHistoryRunLocationId,
        shiftId: ids.shiftA,
        configId: ids.configA,
        status: 'superseded',
        createdAt: new Date('2026-08-22T11:00:00.000Z'),
        warnings: [{ code: 'OLD_WARNING' }],
      }),
      schedule({
        id: ids.scheduleA,
        locationId: loadHistoryRunLocationId,
        shiftId: ids.shiftA,
        configId: ids.configA,
        status: 'accepted',
        createdAt: new Date('2026-08-22T12:00:00.000Z'),
        warnings: [{ code: 'SHIFT_OVERFLOW' }],
      }),
      schedule({
        id: ids.newScheduleA,
        locationId: loadHistoryRunLocationId,
        shiftId: ids.shiftA,
        configId: ids.configA,
        status: 'rejected',
        createdAt: new Date('2026-08-22T13:00:00.000Z'),
      }),
      schedule({
        id: ids.scheduleB,
        locationId: loadHistoryRunLocationId,
        shiftId: ids.shiftB,
        configId: ids.configB,
        status: 'accepted',
        createdAt: new Date('2026-08-22T14:00:00.000Z'),
      }),
      schedule({
        id: ids.siblingSchedule,
        locationId: loadHistoryRunSiblingLocationId,
        shiftId: ids.siblingShift,
        configId: ids.siblingConfig,
        status: 'accepted',
        createdAt: new Date('2026-08-22T14:00:00.000Z'),
      }),
      schedule({
        id: ids.boundarySchedule,
        locationId: loadHistoryRunBoundaryLocationId,
        shiftId: ids.boundaryShift,
        configId: ids.boundaryConfig,
        status: 'accepted',
        createdAt: new Date('2026-08-22T14:00:00.000Z'),
      }),
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values([
      {
        id: ids.runA,
        locationId: loadHistoryRunLocationId,
        productionShiftId: ids.shiftA,
        scheduleRunId: ids.scheduleA,
        status: 'started',
        startedAt: new Date('2026-08-21T12:00:00.000Z'),
        queueVersion: 4,
        plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
        overtimeProposalHash: 'c'.repeat(64),
        overtimeQueueVersion: 4,
        overtimeAcknowledgedBy: ids.actor,
        overtimeAcknowledgedAt: new Date('2026-08-21T11:30:00.000Z'),
        version: 3,
        createdAt: new Date('2026-08-21T11:45:00.000Z'),
      },
      {
        id: ids.runB,
        locationId: loadHistoryRunLocationId,
        productionShiftId: ids.shiftB,
        scheduleRunId: ids.scheduleB,
        status: 'started',
        startedAt: new Date('2026-08-22T12:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
        createdAt: new Date('2026-08-22T11:45:00.000Z'),
      },
      {
        id: ids.siblingRun,
        locationId: loadHistoryRunSiblingLocationId,
        productionShiftId: ids.siblingShift,
        scheduleRunId: ids.siblingSchedule,
        status: 'started',
        startedAt: new Date('2026-08-22T12:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
        createdAt: new Date('2026-08-22T11:45:00.000Z'),
      },
      {
        id: ids.boundaryRun,
        locationId: loadHistoryRunBoundaryLocationId,
        productionShiftId: ids.boundaryShift,
        scheduleRunId: ids.boundarySchedule,
        status: 'started',
        startedAt: new Date('2026-08-22T12:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-08-22T20:00:00.000Z'),
        createdAt: new Date('2026-08-22T11:45:00.000Z'),
      },
    ]);
};

const seedProductionOrder = async (input: {
  fulfillmentId: string;
  demandId: string;
  productionOrderId: string;
  display: string;
  priority: boolean;
  weight: number;
  bagCount: number;
}) => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: input.demandId,
      fulfillmentId: input.fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'd'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: input.display,
      locationId: loadHistoryRunLocationId,
      revisionAt: new Date('2026-08-21T10:00:00.000Z'),
      phase: 'production_released',
      estimatedWeightLbs: input.weight,
      estimatedWeightSource: 'test',
      dueAt: loadHistoryRunAsOf,
    });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values({
      id: input.productionOrderId,
      orderDemandId: input.demandId,
      locationId: loadHistoryRunLocationId,
      dueAt: loadHistoryRunAsOf,
      priority: input.priority,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: input.weight,
      bagCount: input.bagCount,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: new Date('2026-08-21T10:00:00.000Z'),
      intakeVersion: 1,
      version: 2,
    });
};

const seedFloorGraph = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      {
        id: ids.batchA1,
        locationId: loadHistoryRunLocationId,
        productionRunId: ids.runA,
        sequenceIndex: 1,
        status: 'sorting',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 80,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-21T20:00:00.000Z'),
        startedAt: new Date('2026-08-21T14:00:00.000Z'),
        membershipFrozenAt: new Date('2026-08-21T14:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        version: 2,
      },
      {
        id: ids.batchA0,
        locationId: loadHistoryRunLocationId,
        productionRunId: ids.runA,
        sequenceIndex: 0,
        status: 'finished',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 30,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
        startedAt: new Date('2026-08-21T12:00:00.000Z'),
        finishedAt: new Date('2026-08-21T18:15:00.000Z'),
        membershipFrozenAt: new Date('2026-08-21T12:00:00.000Z'),
        membershipFrozenBy: ids.actor,
        version: 4,
      },
      {
        id: ids.batchB,
        locationId: loadHistoryRunLocationId,
        productionRunId: ids.runB,
        sequenceIndex: 0,
        status: 'queued',
        pulseCapacityLbs: 100,
        derivedWeightLbs: 80,
        pulseMinutes: 56,
        plannedDoneAt: new Date('2026-08-22T20:00:00.000Z'),
      },
    ]);
  await seedProductionOrder({
    fulfillmentId: ids.fulfillmentA,
    demandId: ids.demandA,
    productionOrderId: ids.productionOrderA,
    display: 'HISTORY-RUN-A',
    priority: true,
    weight: 80,
    bagCount: 2,
  });
  await seedProductionOrder({
    fulfillmentId: ids.fulfillmentB,
    demandId: ids.demandB,
    productionOrderId: ids.productionOrderB,
    display: 'HISTORY-RUN-B',
    priority: false,
    weight: 30,
    bagCount: 1,
  });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values([
      {
        id: ids.membershipA1,
        locationId: loadHistoryRunLocationId,
        productionBatchId: ids.batchA1,
        productionOrderId: ids.productionOrderA,
        active: false,
        placementProvenance: 'exception_route',
        placedAt: new Date('2026-08-21T14:30:00.000Z'),
        placedBy: ids.actor,
        releasedAt: new Date('2026-08-21T15:00:00.000Z'),
        releasedBy: ids.actor,
        releaseReason: 'episode_released_for_next_run',
      },
      {
        id: ids.membershipBCurrent,
        locationId: loadHistoryRunLocationId,
        productionBatchId: ids.batchA0,
        productionOrderId: ids.productionOrderB,
        active: true,
        placementProvenance: 'initial_schedule',
        placedAt: new Date('2026-08-21T13:40:00.000Z'),
      },
      {
        id: ids.membershipA0,
        locationId: loadHistoryRunLocationId,
        productionBatchId: ids.batchA0,
        productionOrderId: ids.productionOrderA,
        active: false,
        placementProvenance: 'initial_schedule',
        placedAt: new Date('2026-08-21T13:30:00.000Z'),
        releasedAt: new Date('2026-08-21T14:00:00.000Z'),
        releasedBy: ids.actor,
        releaseReason: 'historical_episode_released',
      },
      {
        id: ids.membershipAInRunB,
        locationId: loadHistoryRunLocationId,
        productionBatchId: ids.batchB,
        productionOrderId: ids.productionOrderA,
        active: true,
        placementProvenance: 'automatic',
        placedAt: new Date('2026-08-22T13:00:00.000Z'),
        placedBy: ids.actor,
      },
    ]);
  const stations = [
    ids.sortingStation,
    ids.washingStation,
    ids.dryingStation,
    ids.foldingStation,
  ];
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values(
      stageKinds.map((kind, index) => ({
        id: stations[index] ?? ids.sortingStation,
        locationId: loadHistoryRunLocationId,
        kind,
        label: kind,
        sortOrder: index,
      })),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.washer,
        locationId: loadHistoryRunLocationId,
        stationId: ids.washingStation,
        label: 'Washer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.dryer,
        locationId: loadHistoryRunLocationId,
        stationId: ids.dryingStation,
        label: 'Dryer',
        effectiveCapacityLbs: 100,
      },
    ]);
  const stages = [1, 0].flatMap((batch) =>
    [...stageKinds].reverse().map((stage, reverseIndex) => {
      const index = stageKinds.indexOf(stage);
      const completed = batch === 0;
      const started = batch === 1 && index === 0;
      const plannedStartAt = new Date(
        Date.parse('2026-08-21T12:00:00.000Z') + (batch + index) * 56 * 60_000,
      );
      return {
        id: stageId(batch as 0 | 1, index),
        locationId: loadHistoryRunLocationId,
        productionBatchId: batch === 0 ? ids.batchA0 : ids.batchA1,
        stationId: stations[index] ?? ids.sortingStation,
        stageKind: stage,
        status: completed ? 'completed' : started ? 'started' : 'planned',
        plannedStartAt,
        plannedEndAt: new Date(plannedStartAt.getTime() + 56 * 60_000),
        actualStartAt: completed || started ? plannedStartAt : null,
        actualEndAt: completed
          ? new Date(plannedStartAt.getTime() + 56 * 60_000)
          : null,
        actualStartProvenance:
          completed || started
            ? ('live_observed' as const)
            : ('not_recorded' as const),
        actualEndProvenance: completed
          ? ('operator_reported' as const)
          : ('not_recorded' as const),
        startedBy: completed || started ? ids.actor : null,
        completedBy: completed ? ids.actor : null,
        version: completed ? 3 : started ? 2 : 1,
        reverseIndex,
      };
    }),
  );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(stages.map(({ reverseIndex: _reverseIndex, ...stage }) => stage));
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values(
      [0, 1].flatMap((batch) =>
        [1, 2].map((stage) => ({
          id: uuid(batch * 10 + stage + 101, 33300000),
          locationId: loadHistoryRunLocationId,
          stageRunId: stageId(batch as 0 | 1, stage),
          machineId: stage === 1 ? ids.washer : ids.dryer,
          plannedStartAt: new Date(
            Date.parse('2026-08-21T12:00:00.000Z') +
              (batch + stage) * 56 * 60_000,
          ),
          plannedEndAt: new Date(
            Date.parse('2026-08-21T12:00:00.000Z') +
              (batch + stage + 1) * 56 * 60_000,
          ),
          status: batch === 0 ? 'completed' : 'planned',
        })),
      ),
    );
};

type WorkEventSeed = Readonly<{
  id: string;
  locationId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string;
  createdAt: Date;
  payload?: Record<string, unknown>;
  expectedVersion?: number;
}>;

const workEvent = (input: WorkEventSeed) => ({
  id: input.id,
  locationId: input.locationId,
  eventType: input.eventType,
  entityType: input.entityType,
  entityId: input.entityId,
  actorId: input.actorId,
  idempotencyKey: `load-history-run-${input.id}`,
  payload: input.payload ?? {},
  createdAt: input.createdAt,
  ...(input.expectedVersion === undefined
    ? {}
    : { expectedVersion: input.expectedVersion }),
});

const seedActivity = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values([
      workEvent({
        id: ids.runEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'production_run_started',
        entityType: 'production_run',
        entityId: ids.runA,
        actorId: ids.actor,
        payload: {
          scheduleRunId: ids.scheduleA,
          productionBatchIds: [ids.batchA0, ids.batchA1],
          queueVersion: 1,
        },
        createdAt: new Date('2026-08-22T13:00:00.000Z'),
      }),
      workEvent({
        id: ids.batchEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'batch_membership_frozen',
        entityType: 'production_batch',
        entityId: ids.batchA0,
        actorId: systemActorId,
        payload: { batchVersion: 2, queueVersion: 2 },
        createdAt: new Date('2026-08-22T14:00:00.000Z'),
      }),
      workEvent({
        id: ids.scheduleEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'schedule_accepted',
        entityType: 'schedule_run',
        entityId: ids.scheduleA,
        actorId: ids.actor,
        payload: {
          productionShiftId: ids.shiftA,
          inputSnapshotHash: 'a'.repeat(64),
          outputPlanHash: 'b'.repeat(64),
        },
        createdAt: new Date('2026-08-22T15:00:00.000Z'),
      }),
      workEvent({
        id: ids.shiftEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'production_shift_updated',
        entityType: 'production_shift',
        entityId: ids.shiftA,
        actorId: ids.actor,
        payload: { changedFields: ['effectiveFolderCount'] },
        createdAt: new Date('2026-08-22T16:00:00.000Z'),
      }),
      workEvent({
        id: ids.demandEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'order_demand_applied',
        entityType: 'order_demand',
        entityId: ids.demandA,
        actorId: ids.actor,
        payload: { outcome: 'applied', rawSource: 'private' },
        createdAt: new Date('2026-08-22T17:00:00.000Z'),
      }),
      workEvent({
        id: ids.orderEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'production_order_rebatched',
        entityType: 'production_order',
        entityId: ids.productionOrderA,
        actorId: ids.actor,
        payload: {
          sourceBatchId: ids.batchA0,
          targetBatchId: ids.batchA1,
          reason: 'needs_more_drying',
          note: 'private manager note',
          _idempotency: { private: true },
        },
        createdAt: new Date('2026-08-22T18:00:00.000Z'),
      }),
      workEvent({
        id: ids.stageEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'stage_started',
        entityType: 'stage_run',
        entityId: stageId(1, 0),
        actorId: ids.unknownActor,
        payload: { version: 2, earlyStart: { confirmed: true } },
        expectedVersion: 1,
        createdAt: new Date('2026-08-22T19:00:00.000Z'),
      }),
      workEvent({
        id: uuid(200),
        locationId: loadHistoryRunLocationId,
        eventType: 'production_run_started',
        entityType: 'production_run',
        entityId: ids.runB,
        actorId: ids.actor,
        payload: { scheduleRunId: ids.scheduleB, queueVersion: 1 },
        createdAt: new Date('2026-08-22T12:00:00.000Z'),
      }),
      workEvent({
        id: ids.privateEvent,
        locationId: loadHistoryRunLocationId,
        eventType: 'private_internal_event',
        entityType: 'production_run',
        entityId: ids.runA,
        actorId: ids.actor,
        payload: { private: true },
        createdAt: new Date('2026-08-22T20:00:00.000Z'),
      }),
      workEvent({
        id: ids.siblingEvent,
        locationId: loadHistoryRunSiblingLocationId,
        eventType: 'private_internal_event',
        entityType: 'production_run',
        entityId: ids.siblingRun,
        actorId: ids.actor,
        payload: { private: true },
        createdAt: new Date('2026-08-22T20:00:00.000Z'),
      }),
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.workEvents)
    .values(
      Array.from({ length: 101 }, (_, index) =>
        workEvent({
          id: uuid(index + 1, 33400000),
          locationId: loadHistoryRunBoundaryLocationId,
          eventType: 'production_run_started',
          entityType: 'production_run',
          entityId: ids.boundaryRun,
          actorId: ids.unknownActor,
          payload: {
            scheduleRunId: ids.boundarySchedule,
            queueVersion: 1,
          },
          createdAt: new Date('2026-08-22T20:30:00.000Z'),
        }),
      ),
    );
};

const seed = async (): Promise<void> => {
  await seedLocationsAndActors();
  await seedShiftsAndConfigs();
  await seedSchedulesAndRuns();
  await seedFloorGraph();
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
    stations,
    machines,
    stages,
    assignments,
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
    database.db.select().from(presslyPostgresOwnerSchemas.production.stations),
    database.db.select().from(presslyPostgresOwnerSchemas.production.machines),
    database.db.select().from(presslyPostgresOwnerSchemas.production.stageRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments),
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
    stations,
    machines,
    stages,
    assignments,
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
): ((input: LoadHistoryRunInput) => Promise<unknown>) => {
  const clock = {
    now: () => {
      trace.timing.push('clock');
      return new Date(loadHistoryRunAsOf);
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
  }).cells.loadHistoryRun.execute;
};

type Observation = Readonly<{
  outcomes: readonly CanonicalLoadHistoryRunOutcome[];
  before: Awaited<ReturnType<typeof readCompleteState>>;
  after: Awaited<ReturnType<typeof readCompleteState>>;
  trace: QueryTrace;
}>;

const observe = async (
  scenario: LoadHistoryRunConformanceScenario,
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
  const outcomes = await runLoadHistoryRunConformanceScenario(
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
  outcome: CanonicalLoadHistoryRunOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  return outcome?.kind === 'success' ? (record(outcome.value) ?? {}) : {};
};

const records = (
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const item = record(entry);
        return item === null ? [] : [item];
      })
    : [];

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

describe('production.load-history-run.v1 permanent PostgreSQL conformance', () => {
  it('preserves exact strict location and run identity', () => {
    const input = {
      locationId: loadHistoryRunLocationId,
      productionRunId: ids.runA,
    };
    expect(loadHistoryRunContract.input.decode(input)).toEqual({
      kind: 'valid',
      value: input,
    });
    for (const invalid of [
      { locationId: loadHistoryRunLocationId },
      { locationId: '', productionRunId: ids.runA },
      {
        locationId: loadHistoryRunLocationId,
        productionRunId: 'not-a-uuid',
      },
      { ...input, extra: 'forbidden' },
    ])
      expect(loadHistoryRunContract.input.decode(invalid)).toMatchObject({
        kind: 'invalid',
      });
  });

  it.each(loadHistoryRunConformanceScenarios)('$name', async (scenario) => {
    const observation = await observe(scenario);
    assertReadProof(observation);

    if (scenario.name.startsWith('full run A')) {
      const value = successValue(observation.outcomes[0]);
      expect(loadHistoryRunContract.output.decode(value)).toMatchObject({
        kind: 'valid',
      });
      expect(value['overview']).toMatchObject({
        productionRunId: ids.runA,
        productionShiftId: ids.shiftA,
        scheduleRunId: ids.scheduleA,
        status: 'started',
        timezone: 'America/New_York',
        batchCount: 2,
        completedBatchCount: 1,
        orderCount: 2,
        priorityOrderCount: 1,
        totalWeightLbs: 110,
        queueVersion: 4,
        overtimeAcknowledged: true,
      });
      const batches = records(value['batches']);
      expect(
        batches.map((batch) => [
          batch['productionBatchId'],
          batch['sequence'],
          batch['currentOrderCount'],
          batch['historicalOrderCount'],
        ]),
      ).toEqual([
        [ids.batchA0, 0, 1, 2],
        [ids.batchA1, 1, 0, 1],
      ]);
      const memberships = records(value['orderMemberships']);
      expect(
        memberships.map((membership) => [
          membership['membershipId'],
          membership['productionOrderId'],
          membership['batchSequence'],
          record(membership['placement'])?.['state'],
        ]),
      ).toEqual([
        [ids.membershipA0, ids.productionOrderA, 0, 'released'],
        [ids.membershipBCurrent, ids.productionOrderB, 0, 'current'],
        [ids.membershipA1, ids.productionOrderA, 1, 'released'],
      ]);
      expect(
        memberships.filter(
          (membership) =>
            membership['productionOrderId'] === ids.productionOrderA,
        ),
      ).toHaveLength(2);
      const stageProgress = record(value['stageProgress']);
      expect(stageProgress).toMatchObject({
        planned: 3,
        started: 1,
        completed: 4,
      });
      const stages = records(stageProgress?.['items']);
      expect(
        stages.map((stage) => [
          stage['productionBatchId'],
          stage['batchSequence'],
          stage['stage'],
          stage['machineCount'],
        ]),
      ).toEqual([
        [ids.batchA0, 0, 'sorting', 0],
        [ids.batchA0, 0, 'washing', 1],
        [ids.batchA0, 0, 'drying', 1],
        [ids.batchA0, 0, 'folding_packaging', 0],
        [ids.batchA1, 1, 'sorting', 0],
        [ids.batchA1, 1, 'washing', 1],
        [ids.batchA1, 1, 'drying', 1],
        [ids.batchA1, 1, 'folding_packaging', 0],
      ]);
      const lineage = record(value['scheduleLineage']);
      expect(lineage?.['executionScheduleRunId']).toBe(ids.scheduleA);
      expect(
        records(lineage?.['revisions']).map((revision) => [
          revision['scheduleRunId'],
          revision['linkedProductionRunId'],
          revision['warningCount'],
          revision['acknowledgedWarningCount'],
        ]),
      ).toEqual([
        [ids.newScheduleA, null, 0, 0],
        [ids.scheduleA, ids.runA, 1, 1],
        [ids.oldScheduleA, null, 1, 0],
      ]);
      const activity = record(value['activity']);
      const activityItems = records(activity?.['items']);
      expect(activity?.['hasMore']).toBe(false);
      expect(activityItems.map((item) => item['id'])).toEqual([
        ids.stageEvent,
        ids.orderEvent,
        ids.demandEvent,
        ids.shiftEvent,
        ids.scheduleEvent,
        ids.batchEvent,
        ids.runEvent,
      ]);
      expect(
        activityItems.every((item) => item['productionRunId'] === ids.runA),
      ).toBe(true);
      expect(
        activityItems.find((item) => item['id'] === ids.runEvent)?.['actor'],
      ).toEqual({
        id: ids.actor,
        kind: 'user',
        displayName: 'Alex Historian',
      });
      expect(
        activityItems.find((item) => item['id'] === ids.batchEvent)?.['actor'],
      ).toEqual({
        id: systemActorId,
        kind: 'system',
        displayName: 'System',
      });
      expect(
        activityItems.find((item) => item['id'] === ids.stageEvent)?.['actor'],
      ).toEqual({
        id: ids.unknownActor,
        kind: 'unknown',
        displayName: null,
      });
      const serialized = JSON.stringify(value);
      for (const forbidden of [
        'private manager note',
        '_idempotency',
        'rawSource',
        'load-history-run-conformance@example.com',
        'customerDisplayName',
        'canonical',
      ])
        expect(serialized).not.toContain(forbidden);
      expect(value['asOf']).toBe(loadHistoryRunAsOf.toISOString());
    }

    if (scenario.name.startsWith('cross-run')) {
      const value = successValue(observation.outcomes[0]);
      expect(value['overview']).toMatchObject({
        productionRunId: ids.runB,
        batchCount: 1,
        completedBatchCount: 0,
        orderCount: 1,
        priorityOrderCount: 1,
        totalWeightLbs: 80,
      });
      expect(
        records(value['orderMemberships']).map(
          (membership) => membership['membershipId'],
        ),
      ).toEqual([ids.membershipAInRunB]);
      const activityItems = records(record(value['activity'])?.['items']);
      expect(
        activityItems
          .filter(
            (item) =>
              item['id'] === ids.orderEvent || item['id'] === ids.demandEvent,
          )
          .map((item) => item['productionRunId']),
      ).toEqual([ids.runB, ids.runB]);
      expect(
        activityItems.every((item) => item['productionRunId'] === ids.runB),
      ).toBe(true);
    }

    if (scenario.name.startsWith('empty sibling')) {
      expect(successValue(observation.outcomes[0])).toMatchObject({
        overview: {
          productionRunId: ids.siblingRun,
          batchCount: 0,
          completedBatchCount: 0,
          orderCount: 0,
          priorityOrderCount: 0,
          totalWeightLbs: 0,
        },
        batches: [],
        orderMemberships: [],
        stageProgress: { planned: 0, started: 0, completed: 0, items: [] },
        activity: { items: [], hasMore: false },
      });
    }

    if (scenario.name.startsWith('activity boundary')) {
      const activity = record(
        successValue(observation.outcomes[0])['activity'],
      );
      const activityItems = records(activity?.['items']);
      expect(activityItems).toHaveLength(100);
      expect(activity?.['hasMore']).toBe(true);
      expect(activityItems.map((item) => item['id'])).toEqual(
        Array.from({ length: 100 }, (_, index) => uuid(101 - index, 33400000)),
      );
    }

    if (scenario.name.startsWith('missing location')) {
      expect(observation.outcomes).toMatchObject([
        {
          kind: 'failure',
          failure: { code: 'production_location_not_found' },
        },
        {
          kind: 'failure',
          failure: { code: 'production_history_run_not_found' },
        },
        {
          kind: 'failure',
          failure: { code: 'production_history_run_not_found' },
        },
      ]);
    }
  });
});
