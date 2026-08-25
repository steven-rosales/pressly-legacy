import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import type { IdSource } from '@pressly/cells/id-source';
import { loadBoardContract } from '@pressly/production-system/operations/queries/load-board/contract';
import { makeLoadBoardPostgresRepository } from '@pressly/production-system/operations/queries/load-board/postgres';
import { makeProductionSystem } from '@pressly/production-system/testing/assembly';
import type { LoadBoardInput } from '@pressly/production-system/operations/queries/load-board/types';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  loadBoardAsOf,
  loadBoardConformanceScenarios,
  loadBoardIds as ids,
  loadBoardLocationId,
  loadBoardSiblingLocationId,
  runLoadBoardConformanceScenario,
  type CanonicalLoadBoardOutcome,
  type LoadBoardConformanceScenario,
} from '../src/public.ts';
import { seedProductionLocationConformanceFacts } from './support/production-location-conformance.postgres.ts';
import { productionOnlySystemDependencies } from './support/production-only-system-dependencies.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_load_board_conformance_test',
  ),
  tableNames: [
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
    'order_demands',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
afterAll(database.close);

const uuid = (suffix: number, prefix = 35100000): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const fulfillmentId = (index: number): string => uuid(index + 1, 35300000);
const demandId = (index: number): string => uuid(index + 1, 35400000);
const stageId = (batch: number, stage: number): string =>
  uuid(batch * 10 + stage + 1, 35500000);
const idSource = (): IdSource => ({ next: () => uuid(999, 35600000) });

const stageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;

const seedRootsAndRuns = async (): Promise<void> => {
  await seedProductionLocationConformanceFacts(database.db, [
    {
      id: loadBoardLocationId,
      businessId: ids.business,
      name: 'Load Board Main',
      timezone: 'America/New_York',
      liveRevision: 9,
    },
    {
      id: loadBoardSiblingLocationId,
      businessId: ids.business,
      name: 'Load Board Sibling',
      timezone: 'America/Chicago',
      liveRevision: 3,
    },
  ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values([
      {
        id: ids.targetShift,
        locationId: loadBoardLocationId,
        startsAt: new Date('2026-03-08T04:00:00.000Z'),
        endsAt: new Date('2026-03-08T14:00:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 3,
        version: 2,
      },
      {
        id: ids.otherShift,
        locationId: loadBoardLocationId,
        startsAt: new Date('2026-03-08T04:30:00.000Z'),
        endsAt: new Date('2026-03-08T14:30:00.000Z'),
        timezone: 'America/New_York',
        status: 'open',
        effectiveFolderCount: 2,
        version: 1,
      },
      {
        id: ids.siblingShift,
        locationId: loadBoardSiblingLocationId,
        startsAt: new Date('2026-03-08T05:00:00.000Z'),
        endsAt: new Date('2026-03-08T15:00:00.000Z'),
        timezone: 'America/Chicago',
        status: 'open',
        effectiveFolderCount: 2,
        version: 1,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values([
      {
        id: ids.config,
        locationId: loadBoardLocationId,
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
      },
      {
        id: ids.siblingConfig,
        locationId: loadBoardSiblingLocationId,
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
      },
    ]);

  const schedule = (input: {
    id: string;
    locationId: string;
    shiftId: string;
    configId: string;
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
    batchCount: input.id === ids.targetSchedule ? 5 : 0,
    makespanMinutes: input.id === ids.targetSchedule ? 540 : 0,
    plannedCompletionAt: new Date('2026-03-08T14:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-03-08T03:30:00.000Z'),
    acceptedBy: ids.actor,
  });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values([
      schedule({
        id: ids.targetSchedule,
        locationId: loadBoardLocationId,
        shiftId: ids.targetShift,
        configId: ids.config,
      }),
      schedule({
        id: ids.otherSchedule,
        locationId: loadBoardLocationId,
        shiftId: ids.otherShift,
        configId: ids.config,
      }),
      schedule({
        id: ids.siblingSchedule,
        locationId: loadBoardSiblingLocationId,
        shiftId: ids.siblingShift,
        configId: ids.siblingConfig,
      }),
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values([
      {
        id: ids.targetRun,
        locationId: loadBoardLocationId,
        productionShiftId: ids.targetShift,
        scheduleRunId: ids.targetSchedule,
        status: 'started',
        startedAt: new Date('2026-03-08T04:00:00.000Z'),
        queueVersion: 7,
        plannedCompletionAt: new Date('2026-03-08T14:00:00.000Z'),
        overtimeProposalHash: 'c'.repeat(64),
        overtimeQueueVersion: 7,
        overtimeAcknowledgedBy: ids.actor,
        overtimeAcknowledgedAt: new Date('2026-03-08T04:05:00.000Z'),
        version: 3,
      },
      {
        id: ids.otherRun,
        locationId: loadBoardLocationId,
        productionShiftId: ids.otherShift,
        scheduleRunId: ids.otherSchedule,
        status: 'started',
        startedAt: new Date('2026-03-08T04:30:00.000Z'),
        queueVersion: 2,
        plannedCompletionAt: new Date('2026-03-08T14:30:00.000Z'),
        version: 1,
      },
      {
        id: ids.siblingRun,
        locationId: loadBoardSiblingLocationId,
        productionShiftId: ids.siblingShift,
        scheduleRunId: ids.siblingSchedule,
        status: 'started',
        startedAt: new Date('2026-03-08T05:00:00.000Z'),
        queueVersion: 1,
        plannedCompletionAt: new Date('2026-03-08T15:00:00.000Z'),
        version: 1,
      },
    ]);
};

const seedResources = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values([
      {
        id: ids.sortingStation,
        locationId: loadBoardLocationId,
        kind: 'sorting',
        label: 'Sorting',
        sortOrder: 0,
      },
      {
        id: ids.washingStation,
        locationId: loadBoardLocationId,
        kind: 'washing',
        label: 'Washing',
        sortOrder: 1,
      },
      {
        id: ids.dryingStation,
        locationId: loadBoardLocationId,
        kind: 'drying',
        label: 'Drying',
        sortOrder: 2,
      },
      {
        id: ids.foldingStation,
        locationId: loadBoardLocationId,
        kind: 'folding_packaging',
        label: 'Folding',
        sortOrder: 3,
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.safeWasher,
        locationId: loadBoardLocationId,
        stationId: ids.washingStation,
        label: 'Safe Washer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.conflictWasher,
        locationId: loadBoardLocationId,
        stationId: ids.washingStation,
        label: 'Conflict Washer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.safeDryer,
        locationId: loadBoardLocationId,
        stationId: ids.dryingStation,
        label: 'Safe Dryer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.activeDryer,
        locationId: loadBoardLocationId,
        stationId: ids.dryingStation,
        label: 'Active Dryer',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.unrelatedMachine,
        locationId: loadBoardLocationId,
        stationId: ids.washingStation,
        label: 'Unrelated Washer',
        effectiveCapacityLbs: 100,
      },
    ]);
};

type OrderSeed = Readonly<{
  id: string;
  status: 'scheduled' | 'eligible' | 'finished';
  dueAt: string;
  pendingPlacement?: unknown;
  resolution?: 'open' | 'resolved_without_production';
}>;

const orderSeeds: readonly OrderSeed[] = [
  {
    id: ids.scheduledToday,
    status: 'scheduled',
    dueAt: '2026-03-09T03:30:00.000Z',
  },
  {
    id: ids.scheduledTomorrow,
    status: 'scheduled',
    dueAt: '2026-03-09T04:30:00.000Z',
  },
  {
    id: ids.scheduledOverlap,
    status: 'scheduled',
    dueAt: '2026-03-08T20:00:00.000Z',
  },
  {
    id: ids.scheduledSameKind,
    status: 'scheduled',
    dueAt: '2026-03-10T04:30:00.000Z',
  },
  {
    id: ids.scheduledActive,
    status: 'scheduled',
    dueAt: '2026-03-08T18:00:00.000Z',
  },
  {
    id: ids.eligibleDefault,
    status: 'eligible',
    dueAt: '2026-03-08T04:59:59.999Z',
  },
  {
    id: ids.eligibleStored,
    status: 'eligible',
    dueAt: '2026-03-10T04:30:00.000Z',
    pendingPlacement: {
      status: 'confirmation_required',
      mode: 'automatic',
      productionRunId: ids.targetRun,
      target: {
        kind: 'existing_batch',
        productionBatchId: ids.readyBatch,
        sequence: 0,
      },
      affectedBatchIds: [ids.readyBatch, ids.overlapBatch],
      queueVersion: 7,
      proposalHash: 'd'.repeat(64),
      projectedCompletionAt: '2026-03-08T14:30:00.000Z',
      overtimeMinutes: 30,
    },
  },
  {
    id: ids.finished,
    status: 'finished',
    dueAt: '2026-03-08T04:59:59.999Z',
  },
  {
    id: ids.inactiveQueued,
    status: 'scheduled',
    dueAt: '2026-03-10T04:30:00.000Z',
  },
  {
    id: ids.resolved,
    status: 'eligible',
    dueAt: '2026-03-08T20:00:00.000Z',
    resolution: 'resolved_without_production',
  },
];

const seedProductionOrders = async (): Promise<void> => {
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values(
      orderSeeds.map((seed, index) => ({
        id: demandId(index),
        fulfillmentId: fulfillmentId(index),
        fulfillmentVersion: 1,
        projectionHash: 'e'.repeat(64),
        admissionState: 'released',
        commercialState: seed.status === 'finished' ? 'completed' : 'open',
        displayReference: `BOARD-DIFF-${index + 1}`,
        locationId: loadBoardLocationId,
        revisionAt: new Date('2026-03-08T03:00:00.000Z'),
        phase:
          seed.status === 'finished'
            ? 'post_production'
            : 'production_released',
        estimatedWeightLbs: 20,
        estimatedWeightSource: 'board_conformance',
        dueAt: new Date(seed.dueAt),
      })),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionOrders)
    .values(
      orderSeeds.map((seed, index) => ({
        id: seed.id,
        orderDemandId: demandId(index),
        locationId: loadBoardLocationId,
        dueAt: new Date(seed.dueAt),
        priority: seed.status === 'eligible',
        operationalStatus: seed.status,
        executionStatus:
          seed.status === 'finished'
            ? 'finished'
            : seed.status === 'scheduled'
              ? 'scheduled'
              : 'unassigned',
        resolutionState: seed.resolution ?? 'open',
        ...(seed.resolution === 'resolved_without_production'
          ? {
              resolvedAt: new Date('2026-03-08T03:30:00.000Z'),
              resolvedBy: ids.actor,
              resolutionReason: 'completed_outside_pressly',
            }
          : {}),
        derivedWeightLbs: 20,
        bagCount: 1,
        bagCountSource: 'operator_intake',
        intakeRecordedAt: new Date('2026-03-08T03:15:00.000Z'),
        intakeVersion: 1,
        ...(seed.status === 'finished'
          ? { finishedAt: new Date('2026-03-08T06:00:00.000Z') }
          : {}),
        pendingPlacement: seed.pendingPlacement ?? null,
        version: 2,
      })),
    );
};

type StageSeed = Readonly<{
  id: string;
  batchId: string;
  kind: (typeof stageKinds)[number];
  status: 'planned' | 'started' | 'completed';
  startsAt: string;
  endsAt: string;
}>;

const stationIdFor = (kind: StageSeed['kind']): string => {
  switch (kind) {
    case 'sorting':
      return ids.sortingStation;
    case 'washing':
      return ids.washingStation;
    case 'drying':
      return ids.dryingStation;
    case 'folding_packaging':
      return ids.foldingStation;
  }
};

const fourStages = (
  batchIndex: number,
  batchId: string,
  startHour: number,
  statuses: readonly StageSeed['status'][],
): readonly StageSeed[] =>
  stageKinds.map((kind, stageIndex) => {
    const startsAt = new Date(
      Date.UTC(2026, 2, 8, startHour + stageIndex),
    ).toISOString();
    const endsAt = new Date(
      Date.UTC(2026, 2, 8, startHour + stageIndex + 1),
    ).toISOString();
    return {
      id: stageId(batchIndex, stageIndex),
      batchId,
      kind,
      status: statuses[stageIndex] ?? 'planned',
      startsAt,
      endsAt,
    };
  });

const selectedStages: readonly StageSeed[] = [
  ...fourStages(0, ids.readyBatch, 4, [
    'completed',
    'planned',
    'planned',
    'planned',
  ]),
  ...fourStages(1, ids.overlapBatch, 4, [
    'completed',
    'planned',
    'planned',
    'planned',
  ]),
  ...fourStages(2, ids.sameKindBatch, 3, [
    'completed',
    'completed',
    'planned',
    'planned',
  ]),
  ...fourStages(3, ids.activeBatch, 3, [
    'completed',
    'completed',
    'completed',
    'started',
  ]),
  ...fourStages(4, ids.finishedBatch, 2, [
    'completed',
    'completed',
    'completed',
    'completed',
  ]),
];

const externalStages: readonly StageSeed[] = [
  {
    id: stageId(5, 0),
    batchId: ids.otherSortingBatch,
    kind: 'sorting',
    status: 'started',
    startsAt: '2026-03-08T05:45:00.000Z',
    endsAt: '2026-03-08T06:45:00.000Z',
  },
  {
    id: stageId(6, 2),
    batchId: ids.otherDryingBatch,
    kind: 'drying',
    status: 'started',
    startsAt: '2026-03-08T05:45:00.000Z',
    endsAt: '2026-03-08T06:45:00.000Z',
  },
  {
    id: stageId(7, 1),
    batchId: ids.otherPlannedBatch,
    kind: 'washing',
    status: 'planned',
    startsAt: '2026-03-08T07:00:00.000Z',
    endsAt: '2026-03-08T08:00:00.000Z',
  },
];

const seedExecution = async (): Promise<void> => {
  const batch = (input: {
    id: string;
    runId: string;
    sequence: number;
    status: 'queued' | 'sorting' | 'drying' | 'folding_packaging' | 'finished';
    weight: number;
  }) => ({
    id: input.id,
    locationId: loadBoardLocationId,
    productionRunId: input.runId,
    sequenceIndex: input.sequence,
    status: input.status,
    pulseCapacityLbs: 100,
    derivedWeightLbs: input.weight,
    pulseMinutes: 60,
    plannedDoneAt: new Date('2026-03-08T14:00:00.000Z'),
    ...(input.status === 'queued'
      ? {}
      : {
          startedAt: new Date('2026-03-08T04:00:00.000Z'),
          membershipFrozenAt: new Date('2026-03-08T04:00:00.000Z'),
          membershipFrozenBy: ids.actor,
        }),
    ...(input.status === 'finished'
      ? { finishedAt: new Date('2026-03-08T06:00:00.000Z') }
      : {}),
    version: input.status === 'finished' ? 4 : 1,
  });
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values([
      batch({
        id: ids.finishedBatch,
        runId: ids.targetRun,
        sequence: 4,
        status: 'finished',
        weight: 20,
      }),
      batch({
        id: ids.activeBatch,
        runId: ids.targetRun,
        sequence: 3,
        status: 'folding_packaging',
        weight: 20,
      }),
      batch({
        id: ids.sameKindBatch,
        runId: ids.targetRun,
        sequence: 2,
        status: 'queued',
        weight: 20,
      }),
      batch({
        id: ids.overlapBatch,
        runId: ids.targetRun,
        sequence: 1,
        status: 'queued',
        weight: 20,
      }),
      batch({
        id: ids.readyBatch,
        runId: ids.targetRun,
        sequence: 0,
        status: 'queued',
        weight: 40,
      }),
      batch({
        id: ids.otherSortingBatch,
        runId: ids.otherRun,
        sequence: 0,
        status: 'sorting',
        weight: 20,
      }),
      batch({
        id: ids.otherDryingBatch,
        runId: ids.otherRun,
        sequence: 1,
        status: 'drying',
        weight: 20,
      }),
      batch({
        id: ids.otherPlannedBatch,
        runId: ids.otherRun,
        sequence: 2,
        status: 'queued',
        weight: 20,
      }),
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values([
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.readyBatch,
        productionOrderId: ids.scheduledToday,
        active: true,
        placementProvenance: 'initial_schedule',
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.readyBatch,
        productionOrderId: ids.scheduledTomorrow,
        active: true,
        placementProvenance: 'automatic',
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.overlapBatch,
        productionOrderId: ids.scheduledOverlap,
        active: true,
        placementProvenance: 'manager_exact',
        pinnedAt: new Date('2026-03-08T03:45:00.000Z'),
        pinnedBy: ids.actor,
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.sameKindBatch,
        productionOrderId: ids.scheduledSameKind,
        active: true,
        placementProvenance: 'manual_rebatch',
        pinnedAt: new Date('2026-03-08T03:50:00.000Z'),
        pinnedBy: ids.actor,
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.activeBatch,
        productionOrderId: ids.scheduledActive,
        active: true,
        placementProvenance: 'exception_route',
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.finishedBatch,
        productionOrderId: ids.finished,
        active: false,
        placementProvenance: 'exception_route',
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.readyBatch,
        productionOrderId: ids.inactiveQueued,
        active: false,
        placementProvenance: 'initial_schedule',
      },
      {
        locationId: loadBoardLocationId,
        productionBatchId: ids.readyBatch,
        productionOrderId: ids.resolved,
        active: true,
        placementProvenance: 'initial_schedule',
      },
    ]);
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(
      [...selectedStages, ...externalStages].reverse().map((stage) => ({
        id: stage.id,
        locationId: loadBoardLocationId,
        productionBatchId: stage.batchId,
        stationId: stationIdFor(stage.kind),
        stageKind: stage.kind,
        status: stage.status,
        plannedStartAt: new Date(stage.startsAt),
        plannedEndAt: new Date(stage.endsAt),
        ...(stage.status === 'planned'
          ? {}
          : {
              actualStartAt: new Date(stage.startsAt),
              actualStartProvenance: 'live_observed' as const,
            }),
        ...(stage.status === 'completed'
          ? {
              actualEndAt: new Date(stage.endsAt),
              actualEndProvenance: 'live_observed' as const,
            }
          : {}),
        version: stage.status === 'completed' ? 3 : 1,
      })),
    );
  await database.db
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values([
      {
        locationId: loadBoardLocationId,
        stageRunId: stageId(0, 1),
        machineId: ids.safeWasher,
        plannedStartAt: new Date('2026-03-08T05:00:00.000Z'),
        plannedEndAt: new Date('2026-03-08T06:00:00.000Z'),
      },
      {
        locationId: loadBoardLocationId,
        stageRunId: stageId(1, 1),
        machineId: ids.conflictWasher,
        plannedStartAt: new Date('2026-03-08T05:00:00.000Z'),
        plannedEndAt: new Date('2026-03-08T06:00:00.000Z'),
      },
      {
        locationId: loadBoardLocationId,
        stageRunId: stageId(5, 0),
        machineId: ids.conflictWasher,
        plannedStartAt: new Date('2026-03-08T05:45:00.000Z'),
        plannedEndAt: new Date('2026-03-08T06:45:00.000Z'),
        status: 'completed',
      },
      {
        locationId: loadBoardLocationId,
        stageRunId: stageId(2, 2),
        machineId: ids.safeDryer,
        plannedStartAt: new Date('2026-03-08T05:00:00.000Z'),
        plannedEndAt: new Date('2026-03-08T06:00:00.000Z'),
      },
      {
        locationId: loadBoardLocationId,
        stageRunId: stageId(6, 2),
        machineId: ids.activeDryer,
        plannedStartAt: new Date('2026-03-08T05:45:00.000Z'),
        plannedEndAt: new Date('2026-03-08T06:45:00.000Z'),
      },
      {
        locationId: loadBoardLocationId,
        stageRunId: stageId(7, 1),
        machineId: ids.unrelatedMachine,
        plannedStartAt: new Date('2026-03-08T07:00:00.000Z'),
        plannedEndAt: new Date('2026-03-08T08:00:00.000Z'),
      },
    ]);
};

const seed = async (): Promise<void> => {
  await seedRootsAndRuns();
  await seedResources();
  await seedProductionOrders();
  await seedExecution();
};

const readCompleteState = async () => {
  const [
    locations,
    shifts,
    configs,
    schedules,
    runs,
    stations,
    machines,
    demands,
    productionOrders,
    batches,
    memberships,
    stages,
    assignments,
  ] = await Promise.all([
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionLocations),
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
    database.db.select().from(presslyPostgresOwnerSchemas.production.stations),
    database.db.select().from(presslyPostgresOwnerSchemas.production.machines),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.orderDemands),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatches),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionBatchOrders),
    database.db.select().from(presslyPostgresOwnerSchemas.production.stageRuns),
    database.db
      .select()
      .from(presslyPostgresOwnerSchemas.production.stageMachineAssignments),
  ]);
  return {
    locations,
    shifts,
    configs,
    schedules,
    runs,
    stations,
    machines,
    demands,
    productionOrders,
    batches,
    memberships,
    stages,
    assignments,
  };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];
type TransactionMode = Readonly<{ readOnly: string; isolation: string }>;

const observedDatabase = (input: {
  timing: string[];
  options: TransactionOptions[];
  modes: TransactionMode[];
}): PostgresDatabase => {
  const transaction = (async (
    callback: (transaction: PostgresTransaction) => Promise<unknown>,
    options: TransactionOptions,
  ) => {
    input.timing.push('transaction');
    input.options.push(options);
    return database.db.transaction(async (transaction) => {
      const rows = await transaction.execute(sql`
        select
          current_setting('transaction_read_only') as read_only,
          current_setting('transaction_isolation') as isolation
      `);
      const first = rows[0];
      input.modes.push({
        readOnly:
          typeof first === 'object' && first !== null && 'read_only' in first
            ? String(first['read_only'])
            : 'missing',
        isolation:
          typeof first === 'object' && first !== null && 'isolation' in first
            ? String(first['isolation'])
            : 'missing',
      });
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

const execute = (
  db: PostgresDatabase,
  timing: string[],
): ((input: LoadBoardInput) => Promise<unknown>) => {
  const clock = {
    now: () => {
      timing.push('clock');
      return new Date(loadBoardAsOf);
    },
  };
  return makeProductionSystem({
    ...productionOnlySystemDependencies(),
    db,
    ids: idSource(),
    clock,
  }).cells.loadBoard.execute;
};

type Observation = Readonly<{
  outcomes: readonly CanonicalLoadBoardOutcome[];
  before: Awaited<ReturnType<typeof readCompleteState>>;
  after: Awaited<ReturnType<typeof readCompleteState>>;
  timing: readonly string[];
  options: readonly TransactionOptions[];
  modes: readonly TransactionMode[];
}>;

const observe = async (
  scenario: LoadBoardConformanceScenario,
): Promise<Observation> => {
  await database.reset();
  await seed();
  const before = await readCompleteState();
  const timing: string[] = [];
  const options: TransactionOptions[] = [];
  const modes: TransactionMode[] = [];
  const outcomes = await runLoadBoardConformanceScenario(
    execute(observedDatabase({ timing, options, modes }), timing),
    scenario,
  );
  return {
    outcomes,
    before,
    after: await readCompleteState(),
    timing,
    options,
    modes,
  };
};

const record = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null;

const records = (
  value: unknown,
): readonly Readonly<Record<string, unknown>>[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
        const item = record(entry);
        return item === null ? [] : [item];
      })
    : [];

const successValue = (
  outcome: CanonicalLoadBoardOutcome | undefined,
): Readonly<Record<string, unknown>> => {
  expect(outcome?.kind).toBe('success');
  return outcome?.kind === 'success' ? (record(outcome.value) ?? {}) : {};
};

const batchById = (
  outcome: CanonicalLoadBoardOutcome | undefined,
  batchId: string,
): Readonly<Record<string, unknown>> | undefined =>
  records(successValue(outcome)['batches']).find(
    (batch) => batch['id'] === batchId,
  );

const stages = (
  batch: Readonly<Record<string, unknown>> | undefined,
): readonly Readonly<Record<string, unknown>>[] => records(batch?.['stages']);

const assertSnapshot = (
  observation: Observation,
  requestCount: number,
): void => {
  expect(observation.after).toEqual(observation.before);
  expect(observation.timing).toEqual(
    Array.from({ length: requestCount }, () => ['clock', 'transaction']).flat(),
  );
  expect(observation.options).toEqual(
    Array.from({ length: requestCount }, () => ({
      isolationLevel: 'repeatable read',
      accessMode: 'read only',
    })),
  );
  expect(observation.modes).toEqual(
    Array.from({ length: requestCount }, () => ({
      readOnly: 'on',
      isolation: 'repeatable read',
    })),
  );
};

describe('production.load-board.v1 permanent PostgreSQL conformance', () => {
  it('preserves the strict location and run contract', () => {
    const serialized = {
      params: {
        locationId: loadBoardLocationId,
        productionRunId: ids.targetRun,
      },
    };
    expect(loadBoardContract.input.decode(serialized)).toEqual({
      kind: 'valid',
      value: {
        locationId: loadBoardLocationId,
        productionRunId: ids.targetRun,
      },
    });
    expect(
      loadBoardContract.input.encode({
        locationId: loadBoardLocationId,
        productionRunId: ids.targetRun,
      }),
    ).toEqual(serialized);
    for (const params of [
      { locationId: loadBoardLocationId },
      { locationId: loadBoardLocationId, productionRunId: 'not-a-uuid' },
      {
        locationId: loadBoardLocationId,
        productionRunId: ids.targetRun,
        extra: true,
      },
    ])
      expect(loadBoardContract.input.decode({ params }).kind).toBe('invalid');
  });

  it.each(loadBoardConformanceScenarios)('$name', async (scenario) => {
    const observation = await observe(scenario);
    assertSnapshot(observation, scenario.requests.length);

    if (scenario.name.startsWith('complete')) {
      const outcome = observation.outcomes[0];
      const value = successValue(outcome);
      expect(loadBoardContract.output.decode(value)).toMatchObject({
        kind: 'valid',
      });
      expect(value).toMatchObject({
        productionShift: {
          id: ids.targetShift,
          locationId: loadBoardLocationId,
          timezone: 'America/New_York',
          effectiveFolderCount: 3,
          status: 'open',
          version: 2,
        },
        productionRun: {
          id: ids.targetRun,
          productionShiftId: ids.targetShift,
          status: 'started',
          queueVersion: 7,
          overtimeAcknowledgement: {
            proposalHash: 'c'.repeat(64),
            queueVersion: 7,
            acknowledgedBy: ids.actor,
          },
          version: 3,
        },
        asOf: loadBoardAsOf.toISOString(),
      });
      expect(records(value['batches']).map((batch) => batch['id'])).toEqual([
        ids.readyBatch,
        ids.overlapBatch,
        ids.sameKindBatch,
        ids.activeBatch,
        ids.finishedBatch,
      ]);
      expect(
        records(value['batches']).map((batch) => batch['sequence']),
      ).toEqual([0, 1, 2, 3, 4]);

      const ready = batchById(outcome, ids.readyBatch);
      expect(records(ready?.['orders'])).toMatchObject([
        {
          id: ids.scheduledToday,
          externalOrderId: 'BOARD-DIFF-1',
          dueBucket: 'today',
          placementProvenance: 'initial_schedule',
        },
        {
          id: ids.scheduledTomorrow,
          externalOrderId: 'BOARD-DIFF-2',
          dueBucket: 'tomorrow',
          placementProvenance: 'automatic',
        },
      ]);
      expect(stages(ready).map((stage) => stage['stage'])).toEqual(stageKinds);
      expect(stages(ready)[0]?.['nextAction']).toMatchObject({
        state: 'terminal',
        reason: 'stage_completed',
      });
      expect(stages(ready)[1]?.['nextAction']).toEqual({
        state: 'available',
        action: 'start',
      });
      expect(stages(ready)[2]?.['nextAction']).toMatchObject({
        state: 'blocked',
        code: 'PREVIOUS_STAGE_INCOMPLETE',
      });

      const overlap = batchById(outcome, ids.overlapBatch);
      expect(stages(overlap)[1]?.['nextAction']).toMatchObject({
        state: 'blocked',
        code: 'MACHINE_ASSIGNMENT_OVERLAPS',
      });
      expect(stages(overlap)[1]?.['machineIds']).toEqual([ids.conflictWasher]);
      const sameKind = batchById(outcome, ids.sameKindBatch);
      expect(stages(sameKind)[2]?.['nextAction']).toMatchObject({
        state: 'blocked',
        code: 'STAGE_KIND_ALREADY_ACTIVE',
      });
      const active = batchById(outcome, ids.activeBatch);
      expect(stages(active)[3]?.['nextAction']).toMatchObject({
        state: 'confirmation_required',
        action: 'complete',
        code: 'PULSE_BOUNDARY_NOT_REACHED',
        availableAt: '2026-03-08T07:00:00.000Z',
      });
      expect(
        stages(batchById(outcome, ids.finishedBatch)).every(
          (stage) => record(stage['nextAction'])?.['state'] === 'terminal',
        ),
      ).toBe(true);

      const eligible = records(value['eligibleOrders']);
      expect(eligible.map((order) => order['id'])).toEqual([
        ids.eligibleDefault,
        ids.eligibleStored,
      ]);
      expect(eligible[0]).toMatchObject({
        dueBucket: 'overdue',
        placement: {
          status: 'ambiguous_run',
          reason: 'multiple_started_runs',
          candidateProductionRunIds: [ids.targetRun, ids.otherRun].sort(),
        },
      });
      expect(eligible[1]).toMatchObject({
        dueBucket: 'later',
        placement: {
          status: 'confirmation_required',
          productionRunId: ids.targetRun,
          target: {
            kind: 'existing_batch',
            productionBatchId: ids.readyBatch,
            sequence: 0,
          },
          affectedBatchIds: [ids.readyBatch, ids.overlapBatch],
          queueVersion: 7,
          projectedCompletionAt: '2026-03-08T14:30:00.000Z',
          overtimeMinutes: 30,
        },
      });
      expect(JSON.stringify(value)).not.toMatch(
        /customerDisplayName|canonicalOrder|operationalOrderIdentities|auditIdentity/,
      );
    }

    if (scenario.name.startsWith('valid empty'))
      expect(successValue(observation.outcomes[0])).toMatchObject({
        productionShift: { id: ids.siblingShift },
        productionRun: { id: ids.siblingRun },
        batches: [],
        eligibleOrders: [],
        asOf: loadBoardAsOf.toISOString(),
      });

    if (scenario.name.startsWith('missing'))
      for (const outcome of observation.outcomes)
        expect(outcome).toMatchObject({
          kind: 'failure',
          failure: { code: 'production_board_not_found' },
        });
  });

  it('loads every open location order and bounds conflict assignments to selected plus active stages', async () => {
    await database.reset();
    await seed();
    const before = await readCompleteState();
    const projection = await makeLoadBoardPostgresRepository(
      database.db,
      presslyPostgresOwnerSchemas.production,
    ).load(loadBoardLocationId, ids.targetRun, loadBoardAsOf);
    expect(projection).not.toBeNull();
    if (projection === null) return;

    expect(projection.orders.map(({ id }) => id)).toEqual(
      orderSeeds.filter(({ id }) => id !== ids.resolved).map(({ id }) => id),
    );
    expect(projection.board.batches[0]?.orders.map(({ id }) => id)).toEqual([
      ids.scheduledToday,
      ids.scheduledTomorrow,
    ]);
    expect(projection.board.batches[4]?.orders.map(({ id }) => id)).toEqual([
      ids.finished,
    ]);
    expect(
      projection.board.batches.some((batch) =>
        batch.orders.some(({ id }) => id === ids.inactiveQueued),
      ),
    ).toBe(false);
    const overlap = projection.stageNextActionContexts.find(
      ({ stageRunId }) => stageRunId === stageId(1, 1),
    );
    expect(overlap?.context).toMatchObject({
      previousStageCompleted: true,
      sameKindAlreadyActive: false,
      assignedMachineIds: [ids.conflictWasher],
      overlappingMachineIds: [ids.conflictWasher],
    });
    const sameKind = projection.stageNextActionContexts.find(
      ({ stageRunId }) => stageRunId === stageId(2, 2),
    );
    expect(sameKind?.context).toMatchObject({
      previousStageCompleted: true,
      sameKindAlreadyActive: true,
      assignedMachineIds: [ids.safeDryer],
      overlappingMachineIds: [],
    });
    expect(
      projection.stageNextActionContexts.some(
        ({ stageRunId }) => stageRunId === stageId(7, 1),
      ),
    ).toBe(false);
    expect(JSON.stringify(projection.board)).not.toContain(
      ids.unrelatedMachine,
    );
    expect(await readCompleteState()).toEqual(before);
  });
});
