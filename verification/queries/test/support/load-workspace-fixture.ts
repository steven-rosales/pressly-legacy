import type { PostgresDatabase } from '@pressly/postgres/client';
import { asc, eq } from '@pressly/postgres/query';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';
import type { WorkspaceReadModel } from '@pressly/production-system/operations/queries/load-workspace/execute';
import {
  loadWorkspaceAsOf as asOf,
  loadWorkspaceBusinessId as businessId,
  loadWorkspaceConformanceIds as ids,
  loadWorkspaceLocationId as locationId,
  type LoadWorkspaceFixture,
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
  'production_machines',
  'production_stations',
  'production_orders',
  'order_demands',
  'production_shifts',
  'production_locations',
  'access_production_locations',
  'business_accounts',
] as const;

export const createLoadWorkspaceConformanceDatabase = (): TestDatabaseRuntime =>
  createTestDatabaseRuntime({
    databaseUrl: getTestDatabaseUrl(
      'PRESSLY_TEST_DATABASE_URL',
      'postgres://pressly:pressly@localhost:55434/pressly_load_workspace_conformance_test',
    ),
    tableNames: tables,
    maxConnections: 2,
    ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
      ? {}
      : {
          resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
        }),
  });

const uuid = (suffix: number): string =>
  `36000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const seedLocation = async (database: PostgresDatabase): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.access.businessAccounts)
    .values({
      id: businessId,
      slug: 'load-workspace-conformance',
      displayName: 'Load workspace conformance',
    });
  await database
    .insert(presslyPostgresOwnerSchemas.access.accessProductionLocations)
    .values({
      id: locationId,
      businessId,
      name: 'Workspace Facility',
      timezone: 'America/New_York',
    });
  await seedProductionLocationConformanceFacts(database, [
    {
      id: locationId,
      businessId,
      name: 'Workspace Facility',
      timezone: 'America/New_York',
    },
  ]);
};

const seedConfig = async (database: PostgresDatabase): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.schedulerConfigs)
    .values([
      {
        id: ids.configV1,
        locationId,
        pulseMinutes: 45,
        foldLbsPerFolderMinute: 1.5,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 1,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
          assertedBy: ids.actor,
          assertedAt: '2026-08-20T10:00:00.000Z',
        },
        assertedBy: ids.actor,
        publishedAt: new Date('2026-08-20T10:00:00.000Z'),
      },
      {
        id: ids.configV2,
        locationId,
        pulseMinutes: 60,
        foldLbsPerFolderMinute: 2,
        algorithmVersion: 'fixed-pulse-ffd-v2',
        version: 2,
        stageFitAssertion: {
          sortingFits: true,
          washingFits: true,
          dryingFits: true,
          assertedBy: ids.actor,
          assertedAt: '2026-08-21T10:00:00.000Z',
        },
        assertedBy: ids.actor,
        publishedAt: new Date('2026-08-21T10:00:00.000Z'),
      },
    ]);
};

const seedResources = async (database: PostgresDatabase): Promise<void> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.stations)
    .values([
      {
        id: ids.foldingStation,
        locationId,
        kind: 'folding_packaging',
        label: 'Folding',
        sortOrder: 3,
      },
      {
        id: ids.dryingStation,
        locationId,
        kind: 'drying',
        label: 'Drying',
        sortOrder: 2,
      },
      {
        id: ids.sortingStation,
        locationId,
        kind: 'sorting',
        label: 'Sorting',
        sortOrder: 0,
      },
      {
        id: ids.washingStation,
        locationId,
        kind: 'washing',
        label: 'Washing',
        sortOrder: 1,
      },
    ]);
  await database
    .insert(presslyPostgresOwnerSchemas.production.machines)
    .values([
      {
        id: ids.washerB,
        locationId,
        stationId: ids.washingStation,
        label: 'Washer B',
        effectiveCapacityLbs: 80,
      },
      {
        id: ids.dryer,
        locationId,
        stationId: ids.dryingStation,
        label: 'Dryer A',
        effectiveCapacityLbs: 100,
      },
      {
        id: ids.washerA,
        locationId,
        stationId: ids.washingStation,
        label: 'Washer A',
        effectiveCapacityLbs: 90,
      },
      {
        id: uuid(11),
        locationId,
        stationId: ids.washingStation,
        label: 'Unavailable Capacity',
        effectiveCapacityLbs: null,
      },
    ]);
};

type ShiftStatus = 'draft' | 'open' | 'closed';
type ShiftRow = Readonly<{
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  status: ShiftStatus;
  effectiveFolderCount: number;
  version: number;
}>;

const shiftRow = (input: {
  id: string;
  startOffsetHours: number;
  status?: ShiftStatus;
  durationHours?: number;
}): ShiftRow => ({
  id: input.id,
  locationId,
  startsAt: new Date(asOf.getTime() + input.startOffsetHours * 60 * 60_000),
  endsAt: new Date(
    asOf.getTime() +
      (input.startOffsetHours + (input.durationHours ?? 8)) * 60 * 60_000,
  ),
  timezone: 'America/New_York',
  status: input.status ?? 'open',
  effectiveFolderCount: 2,
  version: 1,
});

const schedulingInput = (shift: ShiftRow) => ({
  orders: [],
  machines: [
    {
      id: ids.washerA,
      stationKind: 'washing' as const,
      effectiveCapacityLbs: 90,
      active: true,
    },
    {
      id: ids.dryer,
      stationKind: 'drying' as const,
      effectiveCapacityLbs: 100,
      active: true,
    },
  ],
  shift: {
    id: shift.id,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    timezone: shift.timezone,
    effectiveFolderCount: shift.effectiveFolderCount,
    version: shift.version,
  },
  config: {
    id: ids.configV2,
    pulseMinutes: 60,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2' as const,
    version: 2,
  },
});

const schedulingOutput = () => ({
  algorithmVersion: 'fixed-pulse-ffd-v2' as const,
  inputSnapshotHash: 'a'.repeat(64),
  outputPlanHash: 'b'.repeat(64),
  canonicalOutput: '{}',
  pulseMinutes: 60,
  pulseCapacityLbs: 90,
  batchCount: 0,
  makespanMinutes: 0,
  plannedCompletionAt: '2026-08-21T20:00:00.000Z',
  batches: [],
  unplacedOrderIds: [],
  warnings: [],
});

const seedShift = async (
  database: PostgresDatabase,
  row: ShiftRow,
): Promise<ShiftRow> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShifts)
    .values(row);
  return row;
};

const seedSchedule = async (
  database: PostgresDatabase,
  input: {
    id: string;
    shift: ShiftRow;
    status: 'draft' | 'accepted';
    createdOffsetMinutes: number;
  },
): Promise<string> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.scheduleRuns)
    .values({
      id: input.id,
      locationId,
      productionShiftId: input.shift.id,
      schedulerConfigId: ids.configV2,
      status: input.status,
      inputSnapshot: schedulingInput(input.shift),
      inputSnapshotHash: 'a'.repeat(64),
      outputPlan: schedulingOutput(),
      outputPlanHash: 'b'.repeat(64),
      algorithmVersion: 'fixed-pulse-ffd-v2',
      pulseCapacityLbs: 90,
      batchCount: 0,
      makespanMinutes: 0,
      plannedCompletionAt: input.shift.endsAt,
      warnings: [],
      acknowledgedWarningCodes: [],
      createdAt: new Date(asOf.getTime() + input.createdOffsetMinutes * 60_000),
      ...(input.status === 'accepted'
        ? {
            acceptedAt: new Date('2026-08-21T15:00:00.000Z'),
            acceptedBy: ids.actor,
          }
        : {}),
    });
  return input.id;
};

const seedRun = async (
  database: PostgresDatabase,
  input: {
    id: string;
    shift: ShiftRow;
    scheduleId: string;
    status: 'started' | 'completed';
    createdOffsetMinutes: number;
  },
): Promise<string> => {
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionRuns)
    .values({
      id: input.id,
      locationId,
      productionShiftId: input.shift.id,
      scheduleRunId: input.scheduleId,
      status: input.status,
      startedAt: input.shift.startsAt,
      ...(input.status === 'completed'
        ? {
            completedAt: new Date(
              input.shift.startsAt.getTime() + 6 * 60 * 60_000,
            ),
          }
        : {}),
      queueVersion: 1,
      plannedCompletionAt: new Date(
        input.shift.startsAt.getTime() + 6 * 60 * 60_000,
      ),
      version: 1,
      createdAt: new Date(asOf.getTime() + input.createdOffsetMinutes * 60_000),
    });
  return input.id;
};

const selectionShifts = () => ({
  newer: shiftRow({ id: ids.newerShift, startOffsetHours: 2 }),
  older: shiftRow({ id: ids.olderShift, startOffsetHours: 1 }),
  third: shiftRow({ id: ids.thirdShift, startOffsetHours: 4 }),
});

const seedSelectionFixture = async (
  database: PostgresDatabase,
  fixture: Exclude<
    LoadWorkspaceFixture,
    'full-started' | 'full-accepted' | 'identity-conflict'
  >,
): Promise<void> => {
  await seedConfig(database);
  const shifts = selectionShifts();

  if (fixture === 'explicit-shift') {
    await seedShift(
      database,
      shiftRow({
        id: ids.explicitShift,
        startOffsetHours: -10,
        status: 'closed',
      }),
    );
    return;
  }

  await seedShift(database, shifts.newer);
  await seedShift(database, shifts.older);

  if (fixture === 'precedence-started') {
    await seedShift(database, shifts.third);
    const newerSchedule = await seedSchedule(database, {
      id: ids.newerSchedule,
      shift: shifts.newer,
      status: 'accepted',
      createdOffsetMinutes: 2,
    });
    await seedRun(database, {
      id: ids.newerRun,
      shift: shifts.newer,
      scheduleId: newerSchedule,
      status: 'started',
      createdOffsetMinutes: 2,
    });
    await seedSchedule(database, {
      id: ids.olderSchedule,
      shift: shifts.older,
      status: 'accepted',
      createdOffsetMinutes: 1,
    });
    return;
  }

  if (fixture === 'multiple-started') {
    const newerSchedule = await seedSchedule(database, {
      id: ids.newerSchedule,
      shift: shifts.newer,
      status: 'accepted',
      createdOffsetMinutes: 2,
    });
    const olderSchedule = await seedSchedule(database, {
      id: ids.olderSchedule,
      shift: shifts.older,
      status: 'accepted',
      createdOffsetMinutes: 1,
    });
    await seedRun(database, {
      id: ids.newerRun,
      shift: shifts.newer,
      scheduleId: newerSchedule,
      status: 'started',
      createdOffsetMinutes: 2,
    });
    await seedRun(database, {
      id: ids.olderRun,
      shift: shifts.older,
      scheduleId: olderSchedule,
      status: 'started',
      createdOffsetMinutes: 1,
    });
    return;
  }

  if (fixture === 'precedence-accepted') {
    await seedSchedule(database, {
      id: ids.newerSchedule,
      shift: shifts.newer,
      status: 'accepted',
      createdOffsetMinutes: 2,
    });
    return;
  }

  if (fixture === 'multiple-accepted') {
    await seedSchedule(database, {
      id: ids.newerSchedule,
      shift: shifts.newer,
      status: 'accepted',
      createdOffsetMinutes: 2,
    });
    await seedSchedule(database, {
      id: ids.olderSchedule,
      shift: shifts.older,
      status: 'accepted',
      createdOffsetMinutes: 1,
    });
    return;
  }

  if (fixture === 'single-future') {
    await database
      .update(presslyPostgresOwnerSchemas.production.productionShifts)
      .set({ status: 'closed' })
      .where(
        eq(
          presslyPostgresOwnerSchemas.production.productionShifts.id,
          shifts.older.id,
        ),
      );
    return;
  }

  const closed = shiftRow({
    id: ids.closedShift,
    startOffsetHours: 5,
    status: 'closed',
  });
  const ended = shiftRow({
    id: ids.endedShift,
    startOffsetHours: -10,
    durationHours: 2,
  });
  const runShift = shiftRow({ id: ids.runShift, startOffsetHours: 6 });
  await seedShift(database, closed);
  await seedShift(database, ended);
  await seedShift(database, runShift);
  await seedSchedule(database, {
    id: ids.newerSchedule,
    shift: shifts.newer,
    status: 'draft',
    createdOffsetMinutes: 2,
  });
  const runSchedule = await seedSchedule(database, {
    id: ids.thirdSchedule,
    shift: runShift,
    status: 'accepted',
    createdOffsetMinutes: 3,
  });
  await seedRun(database, {
    id: ids.completedRun,
    shift: runShift,
    scheduleId: runSchedule,
    status: 'completed',
    createdOffsetMinutes: 3,
  });
};

const seedDemand = async (
  database: PostgresDatabase,
  input: {
    suffix: number;
    displayReference: string;
    dueAt: string;
    phase: 'expected' | 'production_released' | 'post_production';
    productionOrder?: Readonly<{
      id: string;
      status: 'eligible' | 'scheduled';
      executionStatus: 'unassigned' | 'scheduled';
      priority?: boolean;
    }>;
  },
): Promise<void> => {
  const fulfillmentId = uuid(600 + input.suffix);
  const demandId = uuid(700 + input.suffix);
  await database
    .insert(presslyPostgresOwnerSchemas.production.orderDemands)
    .values({
      id: demandId,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'f'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: input.displayReference,
      locationId,
      revisionAt: new Date('2026-08-21T10:00:00.000Z'),
      phase: input.phase,
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'test_estimate',
      dueAt: new Date(input.dueAt),
    });
  if (input.productionOrder !== undefined)
    await database
      .insert(presslyPostgresOwnerSchemas.production.productionOrders)
      .values({
        id: input.productionOrder.id,
        orderDemandId: demandId,
        locationId,
        dueAt: new Date(input.dueAt),
        priority: input.productionOrder.priority ?? false,
        operationalStatus: input.productionOrder.status,
        executionStatus: input.productionOrder.executionStatus,
        resolutionState: 'open',
        derivedWeightLbs: 20,
        bagCount: 1,
        bagCountSource: 'operator_intake',
        intakeRecordedAt: new Date('2026-08-21T11:00:00.000Z'),
        intakeVersion: 1,
        version: 1,
      });
};

const seedFullStarted = async (database: PostgresDatabase): Promise<void> => {
  await seedConfig(database);
  await seedResources(database);
  const shift = await seedShift(
    database,
    shiftRow({ id: ids.targetShift, startOffsetHours: -4 }),
  );
  await seedSchedule(database, {
    id: ids.targetSchedule,
    shift,
    status: 'accepted',
    createdOffsetMinutes: 1,
  });
  await seedRun(database, {
    id: ids.targetRun,
    shift,
    scheduleId: ids.targetSchedule,
    status: 'started',
    createdOffsetMinutes: 1,
  });
  await seedDemand(database, {
    suffix: 1,
    displayReference: 'SCHEDULED',
    dueAt: '2026-08-21T20:00:00.000Z',
    phase: 'post_production',
    productionOrder: {
      id: ids.scheduledOrder,
      status: 'scheduled',
      executionStatus: 'scheduled',
    },
  });
  await seedDemand(database, {
    suffix: 2,
    displayReference: 'READY',
    dueAt: '2026-08-21T18:00:00.000Z',
    phase: 'production_released',
    productionOrder: {
      id: ids.eligibleOrder,
      status: 'eligible',
      executionStatus: 'unassigned',
      priority: true,
    },
  });
  await seedDemand(database, {
    suffix: 3,
    displayReference: 'EXPECTED',
    dueAt: '2026-08-22T18:00:00.000Z',
    phase: 'expected',
  });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionShiftSelections)
    .values({
      productionShiftId: shift.id,
      locationId,
      version: 2,
      selectedBy: ids.actor,
    });
  await database
    .insert(
      presslyPostgresOwnerSchemas.production.productionShiftSelectedOrders,
    )
    .values({
      productionShiftId: shift.id,
      locationId,
      productionOrderId: ids.scheduledOrder,
      selectedBy: ids.actor,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatches)
    .values({
      id: ids.batch,
      locationId,
      productionRunId: ids.targetRun,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 90,
      derivedWeightLbs: 20,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T20:00:00.000Z'),
      version: 1,
    });
  await database
    .insert(presslyPostgresOwnerSchemas.production.productionBatchOrders)
    .values({
      locationId,
      productionBatchId: ids.batch,
      productionOrderId: ids.scheduledOrder,
      active: true,
      placementProvenance: 'initial_schedule',
    });
  const stages = [
    [ids.sorting, ids.sortingStation, 'sorting', 0],
    [ids.washing, ids.washingStation, 'washing', 1],
    [ids.drying, ids.dryingStation, 'drying', 2],
    [ids.folding, ids.foldingStation, 'folding_packaging', 3],
  ] as const;
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageRuns)
    .values(
      stages.map(([id, stationId, stageKind, index]) => ({
        id,
        locationId,
        productionBatchId: ids.batch,
        stationId,
        stageKind,
        status: 'planned',
        plannedStartAt: new Date(
          shift.startsAt.getTime() + index * 60 * 60_000,
        ),
        plannedEndAt: new Date(
          shift.startsAt.getTime() + (index + 1) * 60 * 60_000,
        ),
        version: 1,
      })),
    );
  await database
    .insert(presslyPostgresOwnerSchemas.production.stageMachineAssignments)
    .values([
      {
        locationId,
        stageRunId: ids.washing,
        machineId: ids.washerA,
        plannedStartAt: new Date(shift.startsAt.getTime() + 60 * 60_000),
        plannedEndAt: new Date(shift.startsAt.getTime() + 2 * 60 * 60_000),
      },
      {
        locationId,
        stageRunId: ids.drying,
        machineId: ids.dryer,
        plannedStartAt: new Date(shift.startsAt.getTime() + 2 * 60 * 60_000),
        plannedEndAt: new Date(shift.startsAt.getTime() + 3 * 60 * 60_000),
      },
    ]);
};

const seedFullAccepted = async (database: PostgresDatabase): Promise<void> => {
  await seedConfig(database);
  await seedResources(database);
  const shift = await seedShift(
    database,
    shiftRow({ id: ids.targetShift, startOffsetHours: 2 }),
  );
  await seedSchedule(database, {
    id: ids.targetSchedule,
    shift,
    status: 'accepted',
    createdOffsetMinutes: 1,
  });
  await seedDemand(database, {
    suffix: 1,
    displayReference: 'READY',
    dueAt: '2026-08-22T02:00:00.000Z',
    phase: 'production_released',
    productionOrder: {
      id: ids.eligibleOrder,
      status: 'eligible',
      executionStatus: 'unassigned',
    },
  });
  await seedDemand(database, {
    suffix: 2,
    displayReference: 'EXPECTED',
    dueAt: '2026-08-22T03:00:00.000Z',
    phase: 'expected',
  });
};

export const seedLoadWorkspaceConformance = async (
  database: PostgresDatabase,
  fixture: LoadWorkspaceFixture,
): Promise<void> => {
  await seedLocation(database);
  if (fixture === 'identity-conflict') return seedFullStarted(database);
  if (fixture === 'full-started') return seedFullStarted(database);
  if (fixture === 'full-accepted') return seedFullAccepted(database);
  return seedSelectionFixture(database, fixture);
};

export const loadWorkspaceIdentityConflictReadModel =
  (): WorkspaceReadModel => ({
    workspace: {
      location: {
        id: locationId,
        name: 'Workspace Facility',
        timezone: 'America/New_York',
        isActive: true,
      },
      currentShift: {
        id: ids.targetShift,
        locationId,
        startsAt: new Date('2026-08-21T12:00:00.000Z'),
        endsAt: new Date('2026-08-21T20:00:00.000Z'),
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        status: 'open',
        version: 1,
      },
      shiftSelection: null,
      candidateShifts: [],
      currentSchedulerConfig: null,
      currentScheduleProposal: null,
      activeRuns: [
        {
          id: ids.targetRun,
          productionShiftId: ids.targetShift,
          status: 'started',
          queueVersion: 2,
          plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
          overtimeAcknowledgement: null,
          version: 1,
        },
      ],
      orders: [],
      pendingEligibleOrders: [],
      liveRunChanges: null,
      demandOutlook: null,
      board: null,
      stations: [],
      machines: [],
      asOf,
    },
    boardProjection: null,
    demandOutlookRows: [],
    livePlacement: {
      runContext: {
        input: {
          run: {
            id: ids.targetRun,
            queueVersion: 1,
            startsAt: '2026-08-21T12:00:00.000Z',
            shiftEndsAt: '2026-08-21T20:00:00.000Z',
            pulseMinutes: 60,
            pulseCapacityLbs: 90,
          },
          machines: [],
          batches: [],
        },
        runStatus: 'started',
        batchVersions: {},
        assignedOrderIds: [],
      },
      orders: [],
    },
  });

export const readLoadWorkspaceState = async (database: PostgresDatabase) => {
  const [
    businesses,
    locations,
    shifts,
    configs,
    schedules,
    runs,
    selections,
    selectedOrders,
    demands,
    productionOrders,
    stations,
    machines,
    batches,
    memberships,
    stages,
    assignments,
    attempts,
    events,
  ] = await Promise.all([
    database
      .select()
      .from(presslyPostgresOwnerSchemas.access.businessAccounts)
      .orderBy(asc(presslyPostgresOwnerSchemas.access.businessAccounts.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.access.accessProductionLocations)
      .orderBy(
        asc(presslyPostgresOwnerSchemas.access.accessProductionLocations.id),
      ),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionShifts)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionShifts.id)),
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
      .from(presslyPostgresOwnerSchemas.production.orderDemands)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.orderDemands.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.productionOrders)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.productionOrders.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.stations)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.stations.id)),
    database
      .select()
      .from(presslyPostgresOwnerSchemas.production.machines)
      .orderBy(asc(presslyPostgresOwnerSchemas.production.machines.id)),
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
    businesses,
    locations,
    shifts,
    configs,
    schedules,
    runs,
    selections,
    selectedOrders,
    demands,
    productionOrders,
    stations,
    machines,
    batches,
    memberships,
    stages,
    assignments,
    attempts,
    events,
  };
};

export type LoadWorkspaceReadState = Awaited<
  ReturnType<typeof readLoadWorkspaceState>
>;
