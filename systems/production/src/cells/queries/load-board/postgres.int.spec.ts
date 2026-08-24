import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import type {
  PostgresDatabase,
  PostgresTransaction,
} from '@pressly/postgres/client';
import { sql } from '@pressly/postgres/query';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { productionRules } from '../../../model/public.ts';
import { makeExecuteLoadBoard } from './execute.ts';
import { makeLoadBoardPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
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

const uuid = (suffix: number): string =>
  `33000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const businessId = '00000000-0000-4000-8000-000000000100';
const locationId = 'location-load-board';
const siblingLocationId = 'location-load-board-sibling';
const asOf = new Date('2026-08-21T16:00:00.000Z');
const ids = {
  actor: uuid(1),
  targetShift: uuid(2),
  otherShift: uuid(3),
  siblingShift: uuid(4),
  targetConfig: uuid(5),
  siblingConfig: uuid(6),
  targetSchedule: uuid(7),
  otherSchedule: uuid(8),
  siblingSchedule: uuid(9),
  targetRun: uuid(10),
  otherRun: uuid(11),
  siblingRun: uuid(12),
  sortingStation: uuid(13),
  washingStation: uuid(14),
  dryingStation: uuid(15),
  foldingStation: uuid(16),
  washer: uuid(17),
  dryer: uuid(18),
  unrelatedMachine: uuid(19),
  scheduledA: uuid(20),
  scheduledB: uuid(21),
  eligibleA: uuid(22),
  eligibleB: uuid(23),
  resolved: uuid(24),
  finished: uuid(25),
  inactiveQueued: uuid(26),
  queuedBatch: uuid(30),
  finishedBatch: uuid(31),
  otherBatch: uuid(32),
  queuedSorting: uuid(40),
  queuedWashing: uuid(41),
  queuedDrying: uuid(42),
  queuedFolding: uuid(43),
  finishedSorting: uuid(44),
  finishedWashing: uuid(45),
  finishedDrying: uuid(46),
  finishedFolding: uuid(47),
  otherDrying: uuid(48),
  otherSorting: uuid(49),
} as const;

const seedRunGraph = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values([
    {
      id: locationId,
      businessId,
      name: 'Load Board Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId,
      name: 'Sibling Board Facility',
      timezone: 'America/Chicago',
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values([
    {
      id: ids.targetShift,
      locationId,
      startsAt: new Date('2026-08-21T12:00:00.000Z'),
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 3,
      version: 2,
    },
    {
      id: ids.otherShift,
      locationId,
      startsAt: new Date('2026-08-21T13:00:00.000Z'),
      endsAt: new Date('2026-08-21T23:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
    },
    {
      id: ids.siblingShift,
      locationId: siblingLocationId,
      startsAt: new Date('2026-08-21T12:00:00.000Z'),
      endsAt: new Date('2026-08-21T22:00:00.000Z'),
      timezone: 'America/Chicago',
      status: 'open',
      effectiveFolderCount: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values([
    {
      id: ids.targetConfig,
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
    },
    {
      id: ids.siblingConfig,
      locationId: siblingLocationId,
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
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: new Date('2026-08-21T11:30:00.000Z'),
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.scheduleRuns).values([
    schedule({
      id: ids.targetSchedule,
      locationId,
      shiftId: ids.targetShift,
      configId: ids.targetConfig,
    }),
    schedule({
      id: ids.otherSchedule,
      locationId,
      shiftId: ids.otherShift,
      configId: ids.targetConfig,
    }),
    schedule({
      id: ids.siblingSchedule,
      locationId: siblingLocationId,
      shiftId: ids.siblingShift,
      configId: ids.siblingConfig,
    }),
  ]);
  await database.db.insert(productionTestSchema.productionRuns).values([
    {
      id: ids.targetRun,
      locationId,
      productionShiftId: ids.targetShift,
      scheduleRunId: ids.targetSchedule,
      status: 'started',
      startedAt: new Date('2026-08-21T12:00:00.000Z'),
      queueVersion: 3,
      plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
      overtimeProposalHash: 'c'.repeat(64),
      overtimeQueueVersion: 3,
      overtimeAcknowledgedBy: ids.actor,
      overtimeAcknowledgedAt: new Date('2026-08-21T12:30:00.000Z'),
      version: 2,
    },
    {
      id: ids.otherRun,
      locationId,
      productionShiftId: ids.otherShift,
      scheduleRunId: ids.otherSchedule,
      status: 'started',
      startedAt: new Date('2026-08-21T13:00:00.000Z'),
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-21T21:00:00.000Z'),
      version: 1,
    },
    {
      id: ids.siblingRun,
      locationId: siblingLocationId,
      productionShiftId: ids.siblingShift,
      scheduleRunId: ids.siblingSchedule,
      status: 'started',
      startedAt: new Date('2026-08-21T12:00:00.000Z'),
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-21T20:00:00.000Z'),
      version: 1,
    },
  ]);
  await database.db.insert(productionTestSchema.stations).values([
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
    {
      id: ids.dryingStation,
      locationId,
      kind: 'drying',
      label: 'Drying',
      sortOrder: 2,
    },
    {
      id: ids.foldingStation,
      locationId,
      kind: 'folding_packaging',
      label: 'Folding',
      sortOrder: 3,
    },
  ]);
  await database.db.insert(productionTestSchema.machines).values([
    {
      id: ids.washer,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
    },
    {
      id: ids.dryer,
      locationId,
      stationId: ids.dryingStation,
      label: 'Dryer 1',
      effectiveCapacityLbs: 100,
    },
    {
      id: ids.unrelatedMachine,
      locationId,
      stationId: ids.washingStation,
      label: 'Washer 2',
      effectiveCapacityLbs: 100,
    },
  ]);
};

type OrderSeed = Readonly<{
  id: string;
  status: 'scheduled' | 'eligible' | 'finished';
  dueAt: string;
  resolution?: 'open' | 'resolved_without_production';
  pendingPlacement?: unknown;
}>;

const seedOrders = async (): Promise<void> => {
  const seeds: readonly OrderSeed[] = [
    {
      id: ids.scheduledA,
      status: 'scheduled',
      dueAt: '2026-08-21T20:00:00.000Z',
    },
    {
      id: ids.scheduledB,
      status: 'scheduled',
      dueAt: '2026-08-22T20:00:00.000Z',
    },
    {
      id: ids.eligibleA,
      status: 'eligible',
      dueAt: '2026-08-20T20:00:00.000Z',
    },
    {
      id: ids.eligibleB,
      status: 'eligible',
      dueAt: '2026-08-24T20:00:00.000Z',
      pendingPlacement: {
        status: 'confirmation_required',
        mode: 'automatic',
        productionRunId: ids.targetRun,
        target: {
          kind: 'existing_batch',
          productionBatchId: ids.queuedBatch,
          sequence: 0,
        },
        affectedBatchIds: [ids.queuedBatch],
        queueVersion: 3,
        proposalHash: 'd'.repeat(64),
        projectedCompletionAt: '2026-08-21T21:00:00.000Z',
        overtimeMinutes: 60,
      },
    },
    {
      id: ids.resolved,
      status: 'eligible',
      dueAt: '2026-08-21T20:00:00.000Z',
      resolution: 'resolved_without_production',
    },
    {
      id: ids.finished,
      status: 'finished',
      dueAt: '2026-08-20T20:00:00.000Z',
    },
    {
      id: ids.inactiveQueued,
      status: 'scheduled',
      dueAt: '2026-08-21T20:00:00.000Z',
    },
  ];

  await database.db.insert(productionTestSchema.orderDemands).values(
    seeds.map((seed, index) => ({
      id: uuid(300 + index),
      fulfillmentId: uuid(200 + index),
      fulfillmentVersion: 1,
      projectionHash: 'e'.repeat(64),
      admissionState: 'released',
      commercialState: seed.status === 'finished' ? 'completed' : 'open',
      displayReference: `BOARD-${index + 1}`,
      locationId,
      revisionAt: new Date('2026-08-21T10:00:00.000Z'),
      phase:
        seed.status === 'finished' ? 'post_production' : 'production_released',
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'test_estimate',
      dueAt: new Date(seed.dueAt),
    })),
  );
  await database.db.insert(productionTestSchema.productionOrders).values(
    seeds.map((seed, index) => ({
      id: seed.id,
      orderDemandId: uuid(300 + index),
      locationId,
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
            resolvedAt: new Date('2026-08-21T11:00:00.000Z'),
            resolvedBy: ids.actor,
            resolutionReason: 'completed_outside_pressly',
          }
        : {}),
      derivedWeightLbs: 20,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeRecordedAt: new Date('2026-08-21T10:30:00.000Z'),
      intakeVersion: 1,
      ...(seed.status === 'finished'
        ? { finishedAt: new Date('2026-08-21T15:00:00.000Z') }
        : {}),
      pendingPlacement: seed.pendingPlacement ?? null,
      version: 2,
    })),
  );
};

const stage = (input: {
  id: string;
  batchId: string;
  stationId: string;
  kind: 'sorting' | 'washing' | 'drying' | 'folding_packaging';
  status: 'planned' | 'started' | 'completed';
  startsAt: string;
  endsAt: string;
}) => ({
  id: input.id,
  locationId,
  productionBatchId: input.batchId,
  stationId: input.stationId,
  stageKind: input.kind,
  status: input.status,
  plannedStartAt: new Date(input.startsAt),
  plannedEndAt: new Date(input.endsAt),
  ...(input.status === 'planned'
    ? {}
    : {
        actualStartAt: new Date(input.startsAt),
        actualStartProvenance: 'live_observed' as const,
      }),
  ...(input.status === 'completed'
    ? {
        actualEndAt: new Date(input.endsAt),
        actualEndProvenance: 'live_observed' as const,
      }
    : {}),
  version: input.status === 'completed' ? 3 : 1,
});

const seedExecution = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: ids.finishedBatch,
      locationId,
      productionRunId: ids.targetRun,
      sequenceIndex: 1,
      status: 'finished',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 20,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T20:00:00.000Z'),
      startedAt: new Date('2026-08-21T12:00:00.000Z'),
      finishedAt: new Date('2026-08-21T16:00:00.000Z'),
      membershipFrozenAt: new Date('2026-08-21T12:00:00.000Z'),
      membershipFrozenBy: ids.actor,
      version: 4,
    },
    {
      id: ids.queuedBatch,
      locationId,
      productionRunId: ids.targetRun,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 40,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T16:00:00.000Z'),
      version: 1,
    },
    {
      id: ids.otherBatch,
      locationId,
      productionRunId: ids.otherRun,
      sequenceIndex: 0,
      status: 'drying',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 20,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T18:00:00.000Z'),
      startedAt: new Date('2026-08-21T13:00:00.000Z'),
      membershipFrozenAt: new Date('2026-08-21T13:00:00.000Z'),
      membershipFrozenBy: ids.actor,
      version: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
    {
      locationId,
      productionBatchId: ids.queuedBatch,
      productionOrderId: ids.scheduledA,
      active: true,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: ids.queuedBatch,
      productionOrderId: ids.scheduledB,
      active: true,
      placementProvenance: 'automatic',
    },
    {
      locationId,
      productionBatchId: ids.queuedBatch,
      productionOrderId: ids.inactiveQueued,
      active: false,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: ids.queuedBatch,
      productionOrderId: ids.resolved,
      active: true,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId,
      productionBatchId: ids.finishedBatch,
      productionOrderId: ids.finished,
      active: false,
      placementProvenance: 'exception_route',
    },
  ]);

  await database.db.insert(productionTestSchema.stageRuns).values([
    stage({
      id: ids.queuedDrying,
      batchId: ids.queuedBatch,
      stationId: ids.dryingStation,
      kind: 'drying',
      status: 'planned',
      startsAt: '2026-08-21T14:00:00.000Z',
      endsAt: '2026-08-21T15:00:00.000Z',
    }),
    stage({
      id: ids.queuedSorting,
      batchId: ids.queuedBatch,
      stationId: ids.sortingStation,
      kind: 'sorting',
      status: 'completed',
      startsAt: '2026-08-21T12:00:00.000Z',
      endsAt: '2026-08-21T13:00:00.000Z',
    }),
    stage({
      id: ids.queuedFolding,
      batchId: ids.queuedBatch,
      stationId: ids.foldingStation,
      kind: 'folding_packaging',
      status: 'planned',
      startsAt: '2026-08-21T15:00:00.000Z',
      endsAt: '2026-08-21T16:00:00.000Z',
    }),
    stage({
      id: ids.queuedWashing,
      batchId: ids.queuedBatch,
      stationId: ids.washingStation,
      kind: 'washing',
      status: 'planned',
      startsAt: '2026-08-21T13:00:00.000Z',
      endsAt: '2026-08-21T14:00:00.000Z',
    }),
    stage({
      id: ids.finishedSorting,
      batchId: ids.finishedBatch,
      stationId: ids.sortingStation,
      kind: 'sorting',
      status: 'completed',
      startsAt: '2026-08-21T12:00:00.000Z',
      endsAt: '2026-08-21T13:00:00.000Z',
    }),
    stage({
      id: ids.finishedWashing,
      batchId: ids.finishedBatch,
      stationId: ids.washingStation,
      kind: 'washing',
      status: 'completed',
      startsAt: '2026-08-21T13:00:00.000Z',
      endsAt: '2026-08-21T14:00:00.000Z',
    }),
    stage({
      id: ids.finishedDrying,
      batchId: ids.finishedBatch,
      stationId: ids.dryingStation,
      kind: 'drying',
      status: 'completed',
      startsAt: '2026-08-21T14:00:00.000Z',
      endsAt: '2026-08-21T15:00:00.000Z',
    }),
    stage({
      id: ids.finishedFolding,
      batchId: ids.finishedBatch,
      stationId: ids.foldingStation,
      kind: 'folding_packaging',
      status: 'completed',
      startsAt: '2026-08-21T15:00:00.000Z',
      endsAt: '2026-08-21T16:00:00.000Z',
    }),
    stage({
      id: ids.otherDrying,
      batchId: ids.otherBatch,
      stationId: ids.dryingStation,
      kind: 'drying',
      status: 'started',
      startsAt: '2026-08-21T15:00:00.000Z',
      endsAt: '2026-08-21T16:00:00.000Z',
    }),
    stage({
      id: ids.otherSorting,
      batchId: ids.otherBatch,
      stationId: ids.sortingStation,
      kind: 'sorting',
      status: 'planned',
      startsAt: '2026-08-21T17:00:00.000Z',
      endsAt: '2026-08-21T18:00:00.000Z',
    }),
  ]);
  await database.db
    .insert(productionTestSchema.stageMachineAssignments)
    .values([
      {
        locationId,
        stageRunId: ids.queuedWashing,
        machineId: ids.washer,
        plannedStartAt: new Date('2026-08-21T13:00:00.000Z'),
        plannedEndAt: new Date('2026-08-21T14:00:00.000Z'),
      },
      {
        locationId,
        stageRunId: ids.queuedDrying,
        machineId: ids.dryer,
        plannedStartAt: new Date('2026-08-21T14:00:00.000Z'),
        plannedEndAt: new Date('2026-08-21T15:00:00.000Z'),
      },
      {
        locationId,
        stageRunId: ids.otherDrying,
        machineId: ids.dryer,
        plannedStartAt: new Date('2026-08-21T15:00:00.000Z'),
        plannedEndAt: new Date('2026-08-21T16:00:00.000Z'),
      },
      {
        locationId,
        stageRunId: ids.otherSorting,
        machineId: ids.unrelatedMachine,
        plannedStartAt: new Date('2026-08-21T17:00:00.000Z'),
        plannedEndAt: new Date('2026-08-21T18:00:00.000Z'),
      },
    ]);
};

const seed = async (): Promise<void> => {
  await seedRunGraph();
  await seedOrders();
  await seedExecution();
};

const readState = async () => {
  const [runs, ordersState, batches, memberships, stagesState, assignments] =
    await Promise.all([
      database.db.select().from(productionTestSchema.productionRuns),
      database.db.select().from(productionTestSchema.productionOrders),
      database.db.select().from(productionTestSchema.productionBatches),
      database.db.select().from(productionTestSchema.productionBatchOrders),
      database.db.select().from(productionTestSchema.stageRuns),
      database.db.select().from(productionTestSchema.stageMachineAssignments),
    ]);
  return {
    runs,
    orders: ordersState,
    batches,
    memberships,
    stages: stagesState,
    assignments,
  };
};

type TransactionOptions = Parameters<PostgresDatabase['transaction']>[1];

const observeTransactions = (input: {
  timing?: string[];
  options: TransactionOptions[];
  readOnly: string[];
}): PostgresDatabase => {
  const transaction = (async (
    callback: (transaction: PostgresTransaction) => Promise<unknown>,
    options: TransactionOptions,
  ) => {
    input.timing?.push('read');
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

describe('load-board PostgreSQL read model', () => {
  it('returns the complete ordered board with canonical rules and a read-only clock-before-read snapshot', async () => {
    await seed();
    const before = await readState();
    const timing: string[] = [];
    const options: TransactionOptions[] = [];
    const readOnly: string[] = [];
    const repo = makeLoadBoardPostgresRepository(
      observeTransactions({ timing, options, readOnly }),
      productionTestSchema,
    );
    const execute = makeExecuteLoadBoard({
      repo,
      clock: {
        now: () => {
          timing.push('clock');
          return asOf;
        },
      },
      policy: productionRules,
    });

    const outcome = await execute({
      locationId,
      productionRunId: ids.targetRun,
    });
    expect(outcome).toMatchObject({
      kind: 'success',
      value: {
        productionShift: {
          id: ids.targetShift,
          effectiveFolderCount: 3,
        },
        productionRun: {
          id: ids.targetRun,
          queueVersion: 3,
          overtimeAcknowledgement: {
            proposalHash: 'c'.repeat(64),
            queueVersion: 3,
            acknowledgedBy: ids.actor,
          },
        },
        batches: [
          {
            id: ids.queuedBatch,
            sequence: 0,
            membership: { state: 'mutable' },
            stages: [
              {
                id: ids.queuedSorting,
                stage: 'sorting',
                nextAction: { state: 'terminal' },
              },
              {
                id: ids.queuedWashing,
                stage: 'washing',
                machineIds: [ids.washer],
                nextAction: { state: 'available', action: 'start' },
              },
              {
                id: ids.queuedDrying,
                stage: 'drying',
                machineIds: [ids.dryer],
                nextAction: {
                  state: 'blocked',
                  code: 'PREVIOUS_STAGE_INCOMPLETE',
                },
              },
              {
                id: ids.queuedFolding,
                stage: 'folding_packaging',
              },
            ],
          },
          {
            id: ids.finishedBatch,
            sequence: 1,
            membership: { state: 'frozen', frozenBy: ids.actor },
          },
        ],
        eligibleOrders: [
          { id: ids.eligibleA, dueBucket: 'overdue' },
          {
            id: ids.eligibleB,
            dueBucket: 'later',
            placement: { status: 'confirmation_required' },
          },
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
    expect(JSON.stringify(outcome)).not.toContain('customerDisplayName');
  });

  it('loads all and only open location orders while preserving finished history and active membership', async () => {
    await seed();
    const repo = makeLoadBoardPostgresRepository(
      database.db,
      productionTestSchema,
    );
    const projection = await repo.load(locationId, ids.targetRun, asOf);
    expect(projection).not.toBeNull();
    if (projection === null) return;

    expect(projection.orders.map(({ id }) => id)).toEqual([
      ids.scheduledA,
      ids.scheduledB,
      ids.eligibleA,
      ids.eligibleB,
      ids.finished,
      ids.inactiveQueued,
    ]);
    expect(projection.orders.some(({ id }) => id === ids.resolved)).toBe(false);
    expect(projection.board.batches[0]?.orders.map(({ id }) => id)).toEqual([
      ids.scheduledA,
      ids.scheduledB,
    ]);
    expect(projection.board.batches[1]?.orders.map(({ id }) => id)).toEqual([
      ids.finished,
    ]);
    expect(projection.board.eligibleOrders.map(({ id }) => id)).toEqual([
      ids.eligibleA,
      ids.eligibleB,
    ]);
    expect(projection.board.eligibleOrders[0]?.placement).toEqual({
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message:
        'More than one production run is active; choose the intended run before placing this order.',
      candidateProductionRunIds: [ids.targetRun, ids.otherRun].sort(),
    });
    expect(projection.board.eligibleOrders[1]?.placement.status).toBe(
      'confirmation_required',
    );
  });

  it('bounds assignment reads to selected and active stages', async () => {
    await seed();
    const repo = makeLoadBoardPostgresRepository(
      database.db,
      productionTestSchema,
    );
    const projection = await repo.load(locationId, ids.targetRun, asOf);
    expect(projection).not.toBeNull();
    if (projection === null) return;

    const drying = projection.stageNextActionContexts.find(
      ({ stageRunId }) => stageRunId === ids.queuedDrying,
    );
    expect(drying?.context).toMatchObject({
      sameKindAlreadyActive: true,
      machinesRequired: true,
      assignedMachineIds: [ids.dryer],
      overlappingMachineIds: [],
    });
    expect(
      projection.stageNextActionContexts.some(
        ({ stageRunId }) => stageRunId === ids.otherSorting,
      ),
    ).toBe(false);
    expect(
      JSON.stringify(projection.board).includes(ids.unrelatedMachine),
    ).toBe(false);
  });

  it('keeps run identity location-scoped and returns a valid empty sibling board', async () => {
    await seed();
    const repo = makeLoadBoardPostgresRepository(
      database.db,
      productionTestSchema,
    );

    await expect(
      repo.load(locationId, ids.siblingRun, asOf),
    ).resolves.toBeNull();
    await expect(
      repo.load(siblingLocationId, ids.targetRun, asOf),
    ).resolves.toBeNull();
    await expect(repo.load(locationId, uuid(999), asOf)).resolves.toBeNull();

    const sibling = await repo.load(siblingLocationId, ids.siblingRun, asOf);
    expect(sibling).toMatchObject({
      board: {
        productionShift: { id: ids.siblingShift },
        productionRun: { id: ids.siblingRun },
        batches: [],
        eligibleOrders: [],
        asOf,
      },
      stageNextActionContexts: [],
      orders: [],
    });
  });
});
