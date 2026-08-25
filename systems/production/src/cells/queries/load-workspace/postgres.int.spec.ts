import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { loadWorkspaceContract } from './contract.ts';
import {
  makeExecuteLoadWorkspace,
  type LoadWorkspaceRepository,
} from './execute.ts';
import { makeLoadWorkspacePostgresRepository } from './postgres.ts';
import type {
  DemandForecastInput,
  OnlinePlacementInput,
  OnlinePlacementProposal,
  WorkspaceScheduler,
} from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'stage_machine_assignments',
    'stage_runs',
    'production_shift_selected_orders',
    'production_shift_selections',
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
  ],
  // The read model holds one snapshot connection while Access answers through
  // its independently owned capability connection.
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const uuid = (suffix: number): string =>
  `36000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'location-load-workspace';
const asOf = new Date('2026-08-21T16:00:00.000Z');
const actorId = uuid(1);

const ids = {
  configV1: uuid(2),
  configV2: uuid(3),
  sortingStation: uuid(4),
  washingStation: uuid(5),
  dryingStation: uuid(6),
  foldingStation: uuid(7),
  washerB: uuid(8),
  washerA: uuid(9),
  dryer: uuid(10),
  targetShift: uuid(20),
  targetSchedule: uuid(21),
  targetRun: uuid(22),
  batch: uuid(23),
  sorting: uuid(24),
  washing: uuid(25),
  drying: uuid(26),
  folding: uuid(27),
  scheduledOrder: uuid(30),
  eligibleOrder: uuid(31),
  expectedDemand: uuid(32),
} as const;

const seedLocation = async (active = true): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId,
      name: 'Workspace Facility',
      timezone: 'America/New_York',
      isActive: active,
    },
  ]);
};

const seedConfig = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.schedulerConfigs).values([
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
        assertedBy: actorId,
        assertedAt: '2026-08-20T10:00:00.000Z',
      },
      assertedBy: actorId,
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
        assertedBy: actorId,
        assertedAt: '2026-08-21T10:00:00.000Z',
      },
      assertedBy: actorId,
      publishedAt: new Date('2026-08-21T10:00:00.000Z'),
    },
  ]);
};

const seedResources = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.stations).values([
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
  await database.db.insert(productionTestSchema.machines).values([
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

const shiftRow = (input: {
  id: string;
  startOffsetHours: number;
  status?: 'draft' | 'open' | 'closed';
}) => ({
  id: input.id,
  locationId,
  startsAt: new Date(asOf.getTime() + input.startOffsetHours * 60 * 60_000),
  endsAt: new Date(asOf.getTime() + (input.startOffsetHours + 8) * 60 * 60_000),
  timezone: 'America/New_York',
  status: input.status ?? 'open',
  effectiveFolderCount: 2,
  version: 1,
});

const schedulingInput = (shift: ReturnType<typeof shiftRow>) => ({
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

const seedShift = async (input: {
  suffix: number;
  startOffsetHours: number;
  status?: 'draft' | 'open' | 'closed';
}) => {
  const row = shiftRow({
    id: uuid(100 + input.suffix),
    startOffsetHours: input.startOffsetHours,
    ...(input.status === undefined ? {} : { status: input.status }),
  });
  await database.db.insert(productionTestSchema.productionShifts).values(row);
  return row;
};

const seedSchedule = async (input: {
  suffix: number;
  shift: ReturnType<typeof shiftRow>;
  status: 'draft' | 'accepted';
  createdOffsetMinutes?: number;
}) => {
  const id = uuid(200 + input.suffix);
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id,
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
    plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    createdAt: new Date(
      asOf.getTime() + (input.createdOffsetMinutes ?? input.suffix) * 60_000,
    ),
    ...(input.status === 'accepted'
      ? {
          acceptedAt: new Date('2026-08-21T15:00:00.000Z'),
          acceptedBy: actorId,
        }
      : {}),
  });
  return id;
};

const seedRun = async (input: {
  suffix: number;
  shift: ReturnType<typeof shiftRow>;
  scheduleId: string;
  status?: 'started' | 'completed';
  createdOffsetMinutes?: number;
}) => {
  const id = uuid(300 + input.suffix);
  const status = input.status ?? 'started';
  await database.db.insert(productionTestSchema.productionRuns).values({
    id,
    locationId,
    productionShiftId: input.shift.id,
    scheduleRunId: input.scheduleId,
    status,
    startedAt: input.shift.startsAt,
    ...(status === 'completed'
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
    createdAt: new Date(
      asOf.getTime() + (input.createdOffsetMinutes ?? input.suffix) * 60_000,
    ),
  });
  return id;
};

type SelectionScenario =
  | 'single_started'
  | 'multiple_started'
  | 'single_accepted'
  | 'multiple_accepted'
  | 'single_open'
  | 'multiple_open';

const seedSelectionScenario = async (scenario: SelectionScenario) => {
  await seedLocation();
  await seedConfig();
  const newer = await seedShift({ suffix: 2, startOffsetHours: 2 });
  const older = await seedShift({ suffix: 1, startOffsetHours: 1 });

  if (scenario === 'single_started' || scenario === 'multiple_started') {
    const newerSchedule = await seedSchedule({
      suffix: 2,
      shift: newer,
      status: 'accepted',
    });
    const newerRun = await seedRun({
      suffix: 2,
      shift: newer,
      scheduleId: newerSchedule,
      createdOffsetMinutes: 2,
    });
    if (scenario === 'single_started')
      return { expectedShiftId: newer.id, expectedRunId: newerRun };
    const olderSchedule = await seedSchedule({
      suffix: 1,
      shift: older,
      status: 'accepted',
    });
    const olderRun = await seedRun({
      suffix: 1,
      shift: older,
      scheduleId: olderSchedule,
      createdOffsetMinutes: 1,
    });
    return {
      expectedCandidateIds: [newer.id, older.id],
      expectedRunIds: [newerRun, olderRun],
    };
  }

  if (scenario === 'single_accepted' || scenario === 'multiple_accepted') {
    const newerSchedule = await seedSchedule({
      suffix: 2,
      shift: newer,
      status: 'accepted',
    });
    if (scenario === 'single_accepted')
      return { expectedShiftId: newer.id, expectedScheduleId: newerSchedule };
    const olderSchedule = await seedSchedule({
      suffix: 1,
      shift: older,
      status: 'accepted',
    });
    return {
      expectedCandidateIds: [newer.id, older.id],
      expectedScheduleIds: [newerSchedule, olderSchedule],
    };
  }

  if (scenario === 'single_open') {
    await database.db
      .update(productionTestSchema.productionShifts)
      .set({ status: 'closed' })
      .where(
        sql`${productionTestSchema.productionShifts.id} = ${older.id}::uuid`,
      );
    return { expectedShiftId: newer.id };
  }

  const draft = await seedSchedule({
    suffix: 2,
    shift: newer,
    status: 'draft',
  });
  return {
    expectedCandidateIds: [newer.id, older.id],
    expectedScheduleIds: [draft, null],
  };
};

const forecastDemand = vi.fn((input: DemandForecastInput) => ({
  algorithmVersion: 'fixed-pulse-demand-outlook-v1' as const,
  startsAt: input.shift.startsAt,
  completesAt: input.shift.startsAt,
  pulseMinutes: input.config.pulseMinutes,
  pulseCapacityLbs: 90,
  batchCount: input.demand.length === 0 ? 0 : 1,
  makespanMinutes: input.demand.length === 0 ? 0 : 240,
  batches:
    input.demand.length === 0
      ? []
      : [
          {
            sequence: 0,
            demandIds: input.demand.map((demand) => demand.id),
            estimatedWeightLbs: input.demand.reduce(
              (total, demand) => total + demand.estimatedWeightLbs,
              0,
            ),
            expectedOrderCount: input.demand.filter(
              (demand) => demand.disposition === 'expected',
            ).length,
            readyOrderCount: input.demand.filter(
              (demand) => demand.disposition === 'ready',
            ).length,
          },
        ],
  unplacedDemandIds: [],
}));

const placementProposal = (
  input: OnlinePlacementInput,
): OnlinePlacementProposal => {
  const mode = input.mode;
  const target =
    mode.type === 'manager_exact'
      ? input.batches.find((batch) => batch.id === mode.targetBatchId)!
      : input.batches[0]!;
  return {
    kind: 'proposed',
    algorithmVersion: 'online-stable-insertion-v1',
    inputSnapshotHash: 'c'.repeat(64),
    placementPlanHash:
      mode.type === 'automatic' ? 'd'.repeat(64) : 'e'.repeat(64),
    canonicalPlacement: '{}',
    expectedQueueVersion: input.run.queueVersion,
    target: {
      type: 'existing_batch',
      batchId: target.id,
      sequence: target.sequence,
    },
    affectedFromSequence: target.sequence,
    affectedBatches: input.batches.map((batch) => ({
      sourceBatchId: batch.id,
      sequence: batch.sequence,
      status: batch.status,
      membershipFrozen: batch.membershipFrozen,
      orderIds:
        batch.id === target.id
          ? [...batch.orderIds, input.order.id]
          : batch.orderIds,
      priorityOrderIds: batch.priorityOrderIds,
      derivedWeightLbs:
        batch.id === target.id
          ? batch.derivedWeightLbs + input.order.derivedWeightLbs
          : batch.derivedWeightLbs,
      bagCount:
        batch.id === target.id
          ? batch.bagCount + input.order.bagCount
          : batch.bagCount,
      stages: batch.stages,
      changed: batch.id === target.id,
    })),
    projectedCompletionAt: '2026-08-21T21:00:00.000Z',
    overtime: {
      required: false,
      shiftEndsAt: input.run.shiftEndsAt,
      overrunMinutes: 0,
    },
  };
};

const scheduler: WorkspaceScheduler = {
  forecastDemand,
  proposeOnlinePlacement: placementProposal,
};

const seedDemand = async (input: {
  suffix: number;
  displayReference: string;
  dueAt: string;
  phase: 'expected' | 'production_released' | 'post_production';
  production?: Readonly<{
    id: string;
    status: 'eligible' | 'scheduled' | 'finished';
    executionStatus: 'unassigned' | 'scheduled' | 'finished';
    priority?: boolean;
  }>;
}): Promise<void> => {
  const fulfillmentId = uuid(600 + input.suffix);
  const demandId = uuid(700 + input.suffix);
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: demandId,
    fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'f'.repeat(64),
    admissionState: 'released',
    commercialState:
      input.production?.status === 'finished' ? 'completed' : 'open',
    displayReference: input.displayReference,
    locationId,
    revisionAt: new Date('2026-08-21T10:00:00.000Z'),
    phase: input.phase,
    estimatedWeightLbs: 20,
    estimatedWeightSource: 'test_estimate',
    dueAt: new Date(input.dueAt),
  });
  if (input.production !== undefined)
    await database.db.insert(productionTestSchema.productionOrders).values({
      id: input.production.id,
      orderDemandId: demandId,
      locationId,
      dueAt: new Date(input.dueAt),
      priority: input.production.priority ?? false,
      operationalStatus: input.production.status,
      executionStatus: input.production.executionStatus,
      resolutionState: 'open',
      derivedWeightLbs: 20,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: new Date('2026-08-21T11:00:00.000Z'),
      intakeVersion: 1,
      ...(input.production.status === 'finished'
        ? { finishedAt: new Date('2026-08-21T15:00:00.000Z') }
        : {}),
      version: 1,
    });
};

const seedFullStartedWorkspace = async (): Promise<void> => {
  await seedLocation();
  await seedConfig();
  await seedResources();
  const targetShift = shiftRow({
    id: ids.targetShift,
    startOffsetHours: -4,
  });
  await database.db
    .insert(productionTestSchema.productionShifts)
    .values(targetShift);
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.targetSchedule,
    locationId,
    productionShiftId: targetShift.id,
    schedulerConfigId: ids.configV2,
    status: 'accepted',
    inputSnapshot: schedulingInput(targetShift),
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: schedulingOutput(),
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 90,
    batchCount: 1,
    makespanMinutes: 240,
    plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-08-21T11:00:00.000Z'),
    acceptedBy: actorId,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.targetRun,
    locationId,
    productionShiftId: targetShift.id,
    scheduleRunId: ids.targetSchedule,
    status: 'started',
    startedAt: targetShift.startsAt,
    queueVersion: 2,
    plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
    version: 1,
  });
  await seedDemand({
    suffix: 1,
    displayReference: 'SCHEDULED',
    dueAt: '2026-08-21T20:00:00.000Z',
    phase: 'post_production',
    production: {
      id: ids.scheduledOrder,
      status: 'scheduled',
      executionStatus: 'scheduled',
    },
  });
  await seedDemand({
    suffix: 2,
    displayReference: 'READY',
    dueAt: '2026-08-21T18:00:00.000Z',
    phase: 'production_released',
    production: {
      id: ids.eligibleOrder,
      status: 'eligible',
      executionStatus: 'unassigned',
      priority: true,
    },
  });
  await seedDemand({
    suffix: 3,
    displayReference: 'EXPECTED',
    dueAt: '2026-08-22T18:00:00.000Z',
    phase: 'expected',
  });
  await database.db
    .insert(productionTestSchema.productionShiftSelections)
    .values({
      productionShiftId: targetShift.id,
      locationId,
      version: 2,
      selectedBy: actorId,
    });
  await database.db
    .insert(productionTestSchema.productionShiftSelectedOrders)
    .values({
      productionShiftId: targetShift.id,
      locationId,
      productionOrderId: ids.scheduledOrder,
      selectedBy: actorId,
    });
  await database.db.insert(productionTestSchema.productionBatches).values({
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
  await database.db.insert(productionTestSchema.productionBatchOrders).values({
    locationId,
    productionBatchId: ids.batch,
    productionOrderId: ids.scheduledOrder,
    active: true,
    placementProvenance: 'initial_schedule',
  });
  const stageRows = [
    [ids.sorting, ids.sortingStation, 'sorting', 0],
    [ids.washing, ids.washingStation, 'washing', 1],
    [ids.drying, ids.dryingStation, 'drying', 2],
    [ids.folding, ids.foldingStation, 'folding_packaging', 3],
  ] as const;
  await database.db.insert(productionTestSchema.stageRuns).values(
    stageRows.map(([id, stationId, stageKind, index]) => ({
      id,
      locationId,
      productionBatchId: ids.batch,
      stationId,
      stageKind,
      status: 'planned',
      plannedStartAt: new Date(
        targetShift.startsAt.getTime() + index * 60 * 60_000,
      ),
      plannedEndAt: new Date(
        targetShift.startsAt.getTime() + (index + 1) * 60 * 60_000,
      ),
      version: 1,
    })),
  );
  await database.db
    .insert(productionTestSchema.stageMachineAssignments)
    .values([
      {
        locationId,
        stageRunId: ids.washing,
        machineId: ids.washerA,
        plannedStartAt: new Date(targetShift.startsAt.getTime() + 60 * 60_000),
        plannedEndAt: new Date(
          targetShift.startsAt.getTime() + 2 * 60 * 60_000,
        ),
      },
      {
        locationId,
        stageRunId: ids.drying,
        machineId: ids.dryer,
        plannedStartAt: new Date(
          targetShift.startsAt.getTime() + 2 * 60 * 60_000,
        ),
        plannedEndAt: new Date(
          targetShift.startsAt.getTime() + 3 * 60 * 60_000,
        ),
      },
    ]);
};

const seedAcceptedWorkspace = async (): Promise<void> => {
  await seedLocation();
  await seedConfig();
  await seedResources();
  const shift = shiftRow({ id: ids.targetShift, startOffsetHours: 2 });
  await database.db.insert(productionTestSchema.productionShifts).values(shift);
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.targetSchedule,
    locationId,
    productionShiftId: shift.id,
    schedulerConfigId: ids.configV2,
    status: 'accepted',
    inputSnapshot: schedulingInput(shift),
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: schedulingOutput(),
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 90,
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: new Date('2026-08-22T00:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-08-21T15:00:00.000Z'),
    acceptedBy: actorId,
  });
  await seedDemand({
    suffix: 1,
    displayReference: 'READY',
    dueAt: '2026-08-22T02:00:00.000Z',
    phase: 'production_released',
    production: {
      id: ids.eligibleOrder,
      status: 'eligible',
      executionStatus: 'unassigned',
    },
  });
  await seedDemand({
    suffix: 2,
    displayReference: 'EXPECTED',
    dueAt: '2026-08-22T03:00:00.000Z',
    phase: 'expected',
  });
};

const readState = async () => {
  const [
    locations,
    shifts,
    runs,
    schedules,
    productionOrders,
    batches,
    stages,
  ] = await Promise.all([
    database.db.select().from(productionTestSchema.productionLocations),
    database.db.select().from(productionTestSchema.productionShifts),
    database.db.select().from(productionTestSchema.productionRuns),
    database.db.select().from(productionTestSchema.scheduleRuns),
    database.db.select().from(productionTestSchema.productionOrders),
    database.db.select().from(productionTestSchema.productionBatches),
    database.db.select().from(productionTestSchema.stageRuns),
  ]);
  return {
    locations,
    shifts,
    runs,
    schedules,
    productionOrders,
    batches,
    stages,
  };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];

const observeTransactions = (input: {
  timing: string[];
  options: TransactionOptions[];
  readOnly: string[];
}): PostgresDatabase => {
  const transaction = (async (
    callback: (transaction: PostgresTransaction) => Promise<unknown>,
    options: TransactionOptions,
  ) => {
    input.timing.push('read');
    input.options.push(options);
    return database.db.transaction(async (transaction) => {
      const modes = await transaction.execute(sql`show transaction_read_only`);
      const first = modes[0];
      input.readOnly.push(
        typeof first === 'object' &&
          first !== null &&
          'transaction_read_only' in first
          ? String(first['transaction_read_only'])
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

const executeWith = (
  repo: LoadWorkspaceRepository,
  clock = { now: () => asOf },
) =>
  makeExecuteLoadWorkspace({
    repo,
    clock,
    policy: productionRules,
    scheduler,
  });

describe('load-workspace PostgreSQL read model', () => {
  it.each<SelectionScenario>([
    'single_started',
    'multiple_started',
    'single_accepted',
    'multiple_accepted',
    'single_open',
    'multiple_open',
  ])('preserves %s selection precedence and ambiguity', async (scenario) => {
    const expected = await seedSelectionScenario(scenario);
    const repo = makeLoadWorkspacePostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const loaded = await repo.load(locationId, undefined, asOf);
    expect(loaded).not.toBeNull();
    expect(loaded).not.toBe('shift_not_found');
    if (loaded === null || loaded === 'shift_not_found') return;

    if ('expectedShiftId' in expected)
      expect(loaded.workspace.currentShift?.id).toBe(expected.expectedShiftId);
    else {
      expect(loaded.workspace.currentShift).toBeNull();
      expect(
        loaded.workspace.candidateShifts.map(
          ({ productionShiftId }) => productionShiftId,
        ),
      ).toEqual(expected.expectedCandidateIds);
    }
    if ('expectedRunIds' in expected)
      expect(
        loaded.workspace.candidateShifts.map(
          ({ productionRunId }) => productionRunId,
        ),
      ).toEqual(expected.expectedRunIds);
    if ('expectedScheduleIds' in expected)
      expect(
        loaded.workspace.candidateShifts.map(
          ({ scheduleRunId }) => scheduleRunId,
        ),
      ).toEqual(expected.expectedScheduleIds);
  });

  it('honors explicit query shift and distinguishes unknown shift and inactive location', async () => {
    await seedLocation();
    const first = await seedShift({ suffix: 1, startOffsetHours: 1 });
    const second = await seedShift({
      suffix: 2,
      startOffsetHours: 2,
      status: 'closed',
    });
    const repo = makeLoadWorkspacePostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );

    const explicit = await repo.load(locationId, second.id, asOf);
    expect(explicit).toMatchObject({
      workspace: { currentShift: { id: second.id }, candidateShifts: [] },
    });
    expect(first.id).not.toBe(second.id);
    await expect(repo.load(locationId, uuid(999), asOf)).resolves.toBe(
      'shift_not_found',
    );

    await database.db
      .update(productionTestSchema.productionLocations)
      .set({ isActive: false })
      .where(
        sql`${productionTestSchema.productionLocations.id} = ${locationId}`,
      );
    await expect(repo.load(locationId, undefined, asOf)).resolves.toBeNull();
    await expect(repo.load('missing', undefined, asOf)).resolves.toBeNull();
  });

  it('composes a full started-run workspace from one real read-only clock-before-read snapshot', async () => {
    await seedFullStartedWorkspace();
    const before = await readState();
    const timing: string[] = [];
    const options: TransactionOptions[] = [];
    const readOnly: string[] = [];
    const repo = makeLoadWorkspacePostgresRepository(
      observeTransactions({ timing, options, readOnly }),
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const execute = executeWith(repo, {
      now: () => {
        timing.push('clock');
        return asOf;
      },
    });
    const outcome = await execute({ locationId });

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') {
      expect(outcome.value.currentShift).toEqual({
        id: ids.targetShift,
        locationId,
        startsAt: '2026-08-21T12:00:00.000Z',
        endsAt: '2026-08-21T20:00:00.000Z',
        timezone: 'America/New_York',
        effectiveFolderCount: 2,
        status: 'open',
        version: 1,
      });
      expect(loadWorkspaceContract.output.decode(outcome.value)).toEqual({
        kind: 'valid',
        value: outcome.value,
      });
    }
    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        location: { id: locationId, isActive: true },
        currentShift: { id: ids.targetShift },
        shiftSelection: {
          productionShiftId: ids.targetShift,
          version: 2,
          selectedOrderIds: [ids.scheduledOrder],
        },
        currentSchedulerConfig: { id: ids.configV2, version: 2 },
        currentScheduleProposal: null,
        activeRuns: [{ id: ids.targetRun, status: 'started', queueVersion: 2 }],
        pendingEligibleOrders: [{ id: ids.eligibleOrder }],
        liveRunChanges: {
          productionRunId: ids.targetRun,
          queueVersion: 2,
          orders: [
            {
              id: ids.eligibleOrder,
              recommendedPlacement: { status: 'available' },
              exactBatchTargets: [{ target: { productionBatchId: ids.batch } }],
            },
          ],
        },
        demandOutlook: {
          productionShiftId: ids.targetShift,
          readyOrderCount: 1,
          inProductionOrderCount: 1,
          forecast: null,
        },
        board: {
          productionRun: { id: ids.targetRun },
          batches: [
            {
              id: ids.batch,
              orders: [{ id: ids.scheduledOrder }],
              stages: [
                { stage: 'sorting' },
                { stage: 'washing', machineIds: [ids.washerA] },
                { stage: 'drying', machineIds: [ids.dryer] },
                { stage: 'folding_packaging' },
              ],
            },
          ],
        },
        stations: [
          { id: ids.sortingStation },
          { id: ids.washingStation },
          { id: ids.dryingStation },
          { id: ids.foldingStation },
        ],
        machines: [
          { id: ids.washerA, label: 'Washer A' },
          { id: ids.washerB, label: 'Washer B' },
          { id: ids.dryer, label: 'Dryer A' },
        ],
        asOf: asOf.toISOString(),
      },
    });
    expect(timing).toEqual(['clock', 'read']);
    expect(options).toEqual([
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    ]);
    expect(readOnly).toEqual(['on']);
    expect(await readState()).toEqual(before);
    expect(JSON.stringify(outcome)).not.toContain('identity');
  });

  it('projects an actionable accepted plan, empty board/live state, ordered resources, and scheduler forecast', async () => {
    forecastDemand.mockClear();
    await seedAcceptedWorkspace();
    const repo = makeLoadWorkspacePostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const outcome = await executeWith(repo)({ locationId });

    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        currentShift: { id: ids.targetShift },
        shiftSelection: { version: 0, selectedOrderIds: [] },
        currentSchedulerConfig: { id: ids.configV2, version: 2 },
        currentScheduleProposal: {
          scheduleRunId: ids.targetSchedule,
          status: 'accepted',
          pulseMinutes: 60,
        },
        activeRuns: [],
        pendingEligibleOrders: [
          {
            id: ids.eligibleOrder,
            placement: { reason: 'no_started_run' },
          },
        ],
        liveRunChanges: null,
        board: null,
        demandOutlook: {
          productionShiftId: ids.targetShift,
          readyOrderCount: 1,
          expectedOrderCount: 1,
          forecast: {
            algorithmVersion: 'fixed-pulse-demand-outlook-v1',
            batchCount: 1,
          },
        },
      },
    });
    expect(forecastDemand).toHaveBeenCalledOnce();
  });

  it('surfaces a native-read live placement identity conflict without mutation', async () => {
    await seedFullStartedWorkspace();
    const native = makeLoadWorkspacePostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const conflicting: LoadWorkspaceRepository = {
      load: async (scopedLocationId, shiftId, observedAt) => {
        const loaded = await native.load(scopedLocationId, shiftId, observedAt);
        if (loaded === null || loaded === 'shift_not_found') return loaded;
        return {
          ...loaded,
          workspace: {
            ...loaded.workspace,
            activeRuns: loaded.workspace.activeRuns.map((run) => ({
              ...run,
              queueVersion: run.queueVersion + 1,
            })),
          },
        };
      },
    };
    const before = await readState();
    await expect(
      executeWith(conflicting)({ locationId }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        code: 'production_live_placement_run_mismatch',
        kind: 'conflict',
      },
    });
    expect(await readState()).toEqual(before);
  });
});
