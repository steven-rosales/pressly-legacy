import { productionHistoryRunDetailSchema } from '../../../read-models/production-history/contract.ts';
import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import {
  productionActorReadTestCapability,
  productionScopeReconciliationTestCapability,
} from '../../../testing/production-capabilities.spec-support.ts';
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
import { makeExecuteLoadHistoryRun } from './execute.ts';
import { makeLoadHistoryRunPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_load_history_run_cell_test',
  ),
  tableNames: [
    'stage_machine_assignments',
    'stage_runs',
    'production_batch_orders',
    'production_batches',
    'production_runs',
    'work_events',
    'schedule_runs',
    'scheduler_configs',
    'production_machines',
    'production_stations',
    'production_orders',
    'order_demands',
    'production_shifts',
    'production_locations',
  ],
  maxConnections: 5,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

const uuid = (prefix: number, suffix: number): string =>
  `${String(prefix).padStart(8, '0')}-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const id = {
  business: '00000000-0000-4000-8000-000000000100',
  actor: uuid(64000000, 1),
  shift: uuid(64000000, 2),
  config: uuid(64000000, 3),
  oldSchedule: uuid(64000000, 4),
  schedule: uuid(64000000, 5),
  newerSchedule: uuid(64000000, 6),
  run: uuid(64000000, 7),
  batchZero: uuid(64000000, 8),
  batchOne: uuid(64000000, 9),
  orderA: uuid(64000000, 10),
  fulfillmentA: uuid(64000000, 11),
  demandA: uuid(64000000, 12),
  productionOrderA: uuid(64000000, 13),
  orderB: uuid(64000000, 14),
  fulfillmentB: uuid(64000000, 15),
  demandB: uuid(64000000, 16),
  productionOrderB: uuid(64000000, 17),
  releasedMembership: uuid(64000000, 18),
  currentMembershipA: uuid(64000000, 19),
  currentMembershipB: uuid(64000000, 20),
  sortingStation: uuid(64000000, 21),
  washingStation: uuid(64000000, 22),
  dryingStation: uuid(64000000, 23),
  foldingStation: uuid(64000000, 24),
  washer: uuid(64000000, 25),
  dryer: uuid(64000000, 26),
  runEvent: uuid(64000000, 27),
  orderEvent: uuid(64000000, 28),
  stageEvent: uuid(64000000, 29),
  siblingEvent: uuid(64000000, 30),
  siblingShift: uuid(64000000, 31),
  siblingConfig: uuid(64000000, 32),
  siblingSchedule: uuid(64000000, 33),
  siblingRun: uuid(64000000, 34),
} as const;

const locationId = 'location-load-history-run';
const siblingLocationId = 'location-load-history-run-sibling';
const asOf = new Date('2026-08-22T20:00:00.000Z');
const stageKinds = [
  'sorting',
  'washing',
  'drying',
  'folding_packaging',
] as const;
const stageId = (batch: 0 | 1, stage: number): string =>
  uuid(64100000 + batch, stage + 1);

const insertSchedule = async (input: {
  scheduleRunId: string;
  status: 'accepted' | 'superseded' | 'rejected';
  createdAt: string;
  location?: string;
  shift?: string;
  config?: string;
}) => {
  const accepted = input.status === 'accepted';
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: input.scheduleRunId,
    locationId: input.location ?? locationId,
    productionShiftId: input.shift ?? id.shift,
    schedulerConfigId: input.config ?? id.config,
    status: input.status,
    inputSnapshot: {},
    inputSnapshotHash:
      input.scheduleRunId === id.schedule ? 'a'.repeat(64) : 'c'.repeat(64),
    outputPlan: {},
    outputPlanHash:
      input.scheduleRunId === id.schedule ? 'b'.repeat(64) : 'd'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 0,
    makespanMinutes: 0,
    plannedCompletionAt: new Date('2026-08-22T21:00:00.000Z'),
    warnings: input.status === 'rejected' ? [] : [{ code: 'SHIFT_OVERFLOW' }],
    acknowledgedWarningCodes: accepted ? ['SHIFT_OVERFLOW'] : [],
    createdAt: new Date(input.createdAt),
    acceptedAt: accepted ? new Date('2026-08-22T13:30:00.000Z') : null,
    acceptedBy: accepted ? id.actor : null,
    supersededAt:
      input.status === 'superseded'
        ? new Date('2026-08-22T12:30:00.000Z')
        : null,
  });
};

const seedProductionOrder = async (input: {
  orderId: string;
  fulfillmentId: string;
  demandId: string;
  productionOrderId: string;
  display: string;
  priority: boolean;
  weight: number;
  bagCount: number;
}) => {
  await database.db.insert(productionTestSchema.orderDemands).values({
    id: input.demandId,
    fulfillmentId: input.fulfillmentId,
    fulfillmentVersion: 1,
    projectionHash: 'e'.repeat(64),
    admissionState: 'released',
    commercialState: 'open',
    displayReference: input.display,
    locationId,
    revisionAt: new Date('2026-08-22T10:00:00.000Z'),
    phase: 'production_released',
    estimatedWeightLbs: input.weight,
    estimatedWeightSource: 'test',
    dueAt: new Date('2026-08-22T21:00:00.000Z'),
  });
  await database.db.insert(productionTestSchema.productionOrders).values({
    id: input.productionOrderId,
    orderDemandId: input.demandId,
    locationId,
    dueAt: new Date('2026-08-22T21:00:00.000Z'),
    priority: input.priority,
    operationalStatus: 'scheduled',
    executionStatus: 'scheduled',
    resolutionState: 'open',
    derivedWeightLbs: input.weight,
    bagCount: input.bagCount,
    bagCountSource: 'operator_intake',
    intakeRecordedAt: new Date('2026-08-22T10:00:00.000Z'),
    intakeVersion: 1,
    eligibleAt: new Date('2026-08-22T10:00:00.000Z'),
    version: 2,
  });
};

const seedBase = async () => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: locationId,
      businessId: id.business,
      name: 'History Run Facility',
      timezone: 'America/New_York',
    },
    {
      id: siblingLocationId,
      businessId: id.business,
      name: 'Sibling History Facility',
      timezone: 'America/Chicago',
    },
  ]);
  await database.db.insert(productionTestSchema.productionShifts).values([
    {
      id: id.shift,
      locationId,
      startsAt: new Date('2026-08-22T14:00:00.000Z'),
      endsAt: new Date('2026-08-22T22:00:00.000Z'),
      timezone: 'America/New_York',
      status: 'open',
      effectiveFolderCount: 2,
      version: 1,
    },
    {
      id: id.siblingShift,
      locationId: siblingLocationId,
      startsAt: new Date('2026-08-22T14:00:00.000Z'),
      endsAt: new Date('2026-08-22T22:00:00.000Z'),
      timezone: 'America/Chicago',
      status: 'open',
      effectiveFolderCount: 2,
      version: 1,
    },
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values([
    {
      id: id.config,
      locationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: id.actor,
    },
    {
      id: id.siblingConfig,
      locationId: siblingLocationId,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
      stageFitAssertion: {
        sortingFits: true,
        washingFits: true,
        dryingFits: true,
      },
      assertedBy: id.actor,
    },
  ]);
  await insertSchedule({
    scheduleRunId: id.schedule,
    status: 'accepted',
    createdAt: '2026-08-22T12:00:00.000Z',
  });
  await insertSchedule({
    scheduleRunId: id.siblingSchedule,
    status: 'accepted',
    createdAt: '2026-08-22T12:00:00.000Z',
    location: siblingLocationId,
    shift: id.siblingShift,
    config: id.siblingConfig,
  });
  await database.db.insert(productionTestSchema.productionRuns).values([
    {
      id: id.run,
      locationId,
      productionShiftId: id.shift,
      scheduleRunId: id.schedule,
      status: 'started',
      startedAt: new Date('2026-08-22T14:00:00.000Z'),
      queueVersion: 3,
      plannedCompletionAt: new Date('2026-08-22T21:00:00.000Z'),
      overtimeProposalHash: 'b'.repeat(64),
      overtimeQueueVersion: 3,
      overtimeAcknowledgedBy: id.actor,
      overtimeAcknowledgedAt: new Date('2026-08-22T13:30:00.000Z'),
      version: 1,
      createdAt: new Date('2026-08-22T14:00:00.000Z'),
    },
    {
      id: id.siblingRun,
      locationId: siblingLocationId,
      productionShiftId: id.siblingShift,
      scheduleRunId: id.siblingSchedule,
      status: 'started',
      startedAt: new Date('2026-08-22T14:00:00.000Z'),
      queueVersion: 1,
      plannedCompletionAt: new Date('2026-08-22T21:00:00.000Z'),
      version: 1,
      createdAt: new Date('2026-08-22T14:00:00.000Z'),
    },
  ]);
};

const seedFullGraph = async (includeActivity = true) => {
  await seedBase();
  await insertSchedule({
    scheduleRunId: id.oldSchedule,
    status: 'superseded',
    createdAt: '2026-08-22T11:00:00.000Z',
  });
  await insertSchedule({
    scheduleRunId: id.newerSchedule,
    status: 'rejected',
    createdAt: '2026-08-22T13:00:00.000Z',
  });
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: id.batchOne,
      locationId,
      productionRunId: id.run,
      sequenceIndex: 1,
      status: 'sorting',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 80,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-08-22T20:00:00.000Z'),
      startedAt: new Date('2026-08-22T15:00:00.000Z'),
      membershipFrozenAt: new Date('2026-08-22T15:00:00.000Z'),
      membershipFrozenBy: id.actor,
      version: 2,
    },
    {
      id: id.batchZero,
      locationId,
      productionRunId: id.run,
      sequenceIndex: 0,
      status: 'finished',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-08-22T18:00:00.000Z'),
      startedAt: new Date('2026-08-22T14:00:00.000Z'),
      finishedAt: new Date('2026-08-22T18:15:00.000Z'),
      membershipFrozenAt: new Date('2026-08-22T14:00:00.000Z'),
      membershipFrozenBy: id.actor,
      version: 4,
    },
  ]);
  await seedProductionOrder({
    orderId: id.orderA,
    fulfillmentId: id.fulfillmentA,
    demandId: id.demandA,
    productionOrderId: id.productionOrderA,
    display: 'HISTORY-A',
    priority: true,
    weight: 80,
    bagCount: 2,
  });
  await seedProductionOrder({
    orderId: id.orderB,
    fulfillmentId: id.fulfillmentB,
    demandId: id.demandB,
    productionOrderId: id.productionOrderB,
    display: 'HISTORY-B',
    priority: false,
    weight: 30,
    bagCount: 1,
  });
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
    {
      id: id.releasedMembership,
      locationId,
      productionBatchId: id.batchZero,
      productionOrderId: id.productionOrderA,
      active: false,
      placementProvenance: 'initial_schedule',
      placedAt: new Date('2026-08-22T13:30:00.000Z'),
      releasedAt: new Date('2026-08-22T15:00:00.000Z'),
      releasedBy: id.actor,
      releaseReason: 'needs_more_drying',
    },
    {
      id: id.currentMembershipB,
      locationId,
      productionBatchId: id.batchZero,
      productionOrderId: id.productionOrderB,
      active: true,
      placementProvenance: 'initial_schedule',
      placedAt: new Date('2026-08-22T13:30:00.000Z'),
    },
    {
      id: id.currentMembershipA,
      locationId,
      productionBatchId: id.batchOne,
      productionOrderId: id.productionOrderA,
      active: true,
      placementProvenance: 'exception_route',
      placedAt: new Date('2026-08-22T15:00:00.000Z'),
      placedBy: id.actor,
    },
  ]);
  await database.db.insert(productionTestSchema.stations).values(
    stageKinds.map((kind, index) => ({
      id: [
        id.sortingStation,
        id.washingStation,
        id.dryingStation,
        id.foldingStation,
      ][index]!,
      locationId,
      kind,
      label: kind,
      sortOrder: index,
    })),
  );
  await database.db.insert(productionTestSchema.machines).values([
    {
      id: id.washer,
      locationId,
      stationId: id.washingStation,
      label: 'Washer',
      effectiveCapacityLbs: 100,
    },
    {
      id: id.dryer,
      locationId,
      stationId: id.dryingStation,
      label: 'Dryer',
      effectiveCapacityLbs: 100,
    },
  ]);
  const stageRows = [1, 0].flatMap((batch) =>
    [...stageKinds].reverse().map((kind, reverseIndex) => {
      const index = stageKinds.indexOf(kind);
      const completed = batch === 0;
      const started = batch === 1 && index === 0;
      return {
        id: stageId(batch as 0 | 1, index),
        locationId,
        productionBatchId: batch === 0 ? id.batchZero : id.batchOne,
        stationId: [
          id.sortingStation,
          id.washingStation,
          id.dryingStation,
          id.foldingStation,
        ][index]!,
        stageKind: kind,
        status: completed ? 'completed' : started ? 'started' : 'planned',
        plannedStartAt: new Date(
          Date.parse('2026-08-22T14:00:00.000Z') +
            (batch + index) * 56 * 60_000,
        ),
        plannedEndAt: new Date(
          Date.parse('2026-08-22T14:00:00.000Z') +
            (batch + index + 1) * 56 * 60_000,
        ),
        actualStartAt:
          completed || started
            ? new Date(
                Date.parse('2026-08-22T14:00:00.000Z') +
                  (batch + index) * 56 * 60_000,
              )
            : null,
        actualEndAt: completed
          ? new Date(
              Date.parse('2026-08-22T14:00:00.000Z') +
                (batch + index + 1) * 56 * 60_000,
            )
          : null,
        actualStartProvenance:
          completed || started
            ? ('live_observed' as const)
            : ('not_recorded' as const),
        actualEndProvenance: completed
          ? ('live_observed' as const)
          : ('not_recorded' as const),
        startedBy: completed || started ? id.actor : null,
        completedBy: completed ? id.actor : null,
        version: completed ? 3 : started ? 2 : 1,
        reverseIndex,
      };
    }),
  );
  await database.db
    .insert(productionTestSchema.stageRuns)
    .values(stageRows.map(({ reverseIndex: _reverseIndex, ...row }) => row));
  await database.db.insert(productionTestSchema.stageMachineAssignments).values(
    [0, 1].flatMap((batch) =>
      [1, 2].map((stage) => ({
        id: uuid(64200000 + batch, stage),
        locationId,
        stageRunId: stageId(batch as 0 | 1, stage),
        machineId: stage === 1 ? id.washer : id.dryer,
        plannedStartAt: new Date(
          Date.parse('2026-08-22T14:00:00.000Z') +
            (batch + stage) * 56 * 60_000,
        ),
        plannedEndAt: new Date(
          Date.parse('2026-08-22T14:00:00.000Z') +
            (batch + stage + 1) * 56 * 60_000,
        ),
        status: batch === 0 ? 'completed' : 'planned',
      })),
    ),
  );
  if (includeActivity)
    await database.db.insert(productionTestSchema.workEvents).values([
      {
        id: id.runEvent,
        locationId,
        eventType: 'production_run_started',
        entityType: 'production_run',
        entityId: id.run,
        actorId: id.actor,
        idempotencyKey: 'history-run-event',
        payload: {
          scheduleRunId: id.schedule,
          productionBatchIds: [id.batchZero, id.batchOne],
          queueVersion: 1,
          _idempotency: { private: true },
        },
        createdAt: new Date('2026-08-22T14:00:00.000Z'),
      },
      {
        id: id.orderEvent,
        locationId,
        eventType: 'production_order_rebatched',
        entityType: 'production_order',
        entityId: id.productionOrderA,
        actorId: id.actor,
        idempotencyKey: 'history-order-event',
        payload: {
          productionRunId: id.run,
          sourceBatchId: id.batchZero,
          targetBatchId: id.batchOne,
          reason: 'needs_more_drying',
          _idempotency: { secret: true },
        },
        createdAt: new Date('2026-08-22T15:00:00.000Z'),
      },
      {
        id: id.stageEvent,
        locationId,
        eventType: 'stage_started',
        entityType: 'stage_run',
        entityId: stageId(1, 0),
        actorId: id.actor,
        expectedVersion: 1,
        idempotencyKey: 'history-stage-event',
        payload: { version: 2 },
        createdAt: new Date('2026-08-22T16:00:00.000Z'),
      },
      {
        id: id.siblingEvent,
        locationId: siblingLocationId,
        eventType: 'production_run_started',
        entityType: 'production_run',
        entityId: id.siblingRun,
        actorId: id.actor,
        idempotencyKey: 'history-sibling-event',
        payload: { scheduleRunId: id.siblingSchedule, queueVersion: 1 },
        createdAt: new Date('2026-08-22T17:00:00.000Z'),
      },
    ]);
};

const execute = (clock = vi.fn(() => new Date(asOf))) => ({
  clock,
  run: makeExecuteLoadHistoryRun({
    repo: makeLoadHistoryRunPostgresRepository(
      database.db,
      productionTestSchema,
      productionActorReadTestCapability([
        { id: id.actor, displayName: 'Alex Historian' },
      ]),
      productionScopeReconciliationTestCapability(database.db),
    ),
    clock: { now: clock },
  }),
});

const durableSnapshot = async () =>
  Promise.all([
    database.db
      .select()
      .from(productionTestSchema.productionLocations)
      .orderBy(productionTestSchema.productionLocations.id),
    database.db
      .select()
      .from(productionTestSchema.productionRuns)
      .orderBy(productionTestSchema.productionRuns.id),
    database.db
      .select()
      .from(productionTestSchema.productionBatches)
      .orderBy(productionTestSchema.productionBatches.id),
    database.db
      .select()
      .from(productionTestSchema.productionBatchOrders)
      .orderBy(productionTestSchema.productionBatchOrders.id),
    database.db
      .select()
      .from(productionTestSchema.stageRuns)
      .orderBy(productionTestSchema.stageRuns.id),
    database.db
      .select()
      .from(productionTestSchema.stageMachineAssignments)
      .orderBy(productionTestSchema.stageMachineAssignments.id),
    database.db
      .select()
      .from(productionTestSchema.scheduleRuns)
      .orderBy(productionTestSchema.scheduleRuns.id),
    database.db
      .select()
      .from(productionTestSchema.productionOrders)
      .orderBy(productionTestSchema.productionOrders.id),
    database.db
      .select()
      .from(productionTestSchema.workEvents)
      .orderBy(productionTestSchema.workEvents.id),
  ]);

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

describe('load history run native PostgreSQL cell', () => {
  it('distinguishes missing location, concealed cross-location run, and an empty graph', async () => {
    await seedBase();
    const target = execute();
    await expect(
      target.run({ locationId: 'missing-location', productionRunId: id.run }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_location_not_found' },
    });
    await expect(
      target.run({ locationId, productionRunId: id.siblingRun }),
    ).resolves.toMatchObject({
      kind: 'failure',
      failure: { code: 'production_history_run_not_found' },
    });
    await expect(
      target.run({
        locationId: siblingLocationId,
        productionRunId: id.siblingRun,
      }),
    ).resolves.toMatchObject({ kind: 'success' });
    const empty = await target.run({ locationId, productionRunId: id.run });
    expect(empty).toMatchObject({
      kind: 'success',
      value: {
        overview: {
          productionRunId: id.run,
          batchCount: 0,
          completedBatchCount: 0,
          orderCount: 0,
          priorityOrderCount: 0,
          totalWeightLbs: 0,
        },
        batches: [],
        orderMemberships: [],
        stageProgress: { planned: 0, started: 0, completed: 0, items: [] },
        scheduleLineage: {
          executionScheduleRunId: id.schedule,
          revisions: [{ scheduleRunId: id.schedule }],
        },
        activity: { items: [], hasMore: false },
        asOf: asOf.toISOString(),
      },
    });
    expect(target.clock).toHaveBeenCalledTimes(4);
  });

  it('projects the full graph, historical episodes, ordering, statistics, and no writes', async () => {
    await seedFullGraph();
    const before = await durableSnapshot();
    const target = execute();
    const outcome = await target.run({ locationId, productionRunId: id.run });
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'failure') return;
    const value = outcome.value;
    expect(() => productionHistoryRunDetailSchema.parse(value)).not.toThrow();
    expect(value.overview).toMatchObject({
      productionRunId: id.run,
      status: 'started',
      batchCount: 2,
      completedBatchCount: 1,
      orderCount: 2,
      priorityOrderCount: 1,
      totalWeightLbs: 110,
      queueVersion: 3,
      overtimeAcknowledged: true,
    });
    expect(
      value.batches.map((batch) => [
        batch.productionBatchId,
        batch.sequence,
        batch.currentOrderCount,
        batch.historicalOrderCount,
      ]),
    ).toEqual([
      [id.batchZero, 0, 1, 2],
      [id.batchOne, 1, 1, 1],
    ]);
    expect(
      value.orderMemberships.map((membership) => [
        membership.membershipId,
        membership.productionOrderId,
        membership.batchSequence,
        membership.placement.state,
      ]),
    ).toEqual([
      [id.releasedMembership, id.productionOrderA, 0, 'released'],
      [id.currentMembershipB, id.productionOrderB, 0, 'current'],
      [id.currentMembershipA, id.productionOrderA, 1, 'current'],
    ]);
    expect(
      value.orderMemberships.filter(
        (membership) => membership.productionOrderId === id.productionOrderA,
      ),
    ).toHaveLength(2);
    expect(value.stageProgress).toMatchObject({
      planned: 3,
      started: 1,
      completed: 4,
    });
    expect(
      value.stageProgress.items.map((stage) => [
        stage.productionBatchId,
        stage.batchSequence,
        stage.stage,
      ]),
    ).toEqual([
      [id.batchZero, 0, 'sorting'],
      [id.batchZero, 0, 'washing'],
      [id.batchZero, 0, 'drying'],
      [id.batchZero, 0, 'folding_packaging'],
      [id.batchOne, 1, 'sorting'],
      [id.batchOne, 1, 'washing'],
      [id.batchOne, 1, 'drying'],
      [id.batchOne, 1, 'folding_packaging'],
    ]);
    expect(
      value.stageProgress.items.map((stage) => stage.machineCount),
    ).toEqual([0, 1, 1, 0, 0, 1, 1, 0]);
    expect(
      value.scheduleLineage.revisions.map((plan) => [
        plan.scheduleRunId,
        plan.linkedProductionRunId,
        plan.warningCount,
        plan.acknowledgedWarningCount,
      ]),
    ).toEqual([
      [id.newerSchedule, null, 0, 0],
      [id.schedule, id.run, 1, 1],
      [id.oldSchedule, null, 1, 0],
    ]);
    expect(value.activity.items.map((activity) => activity.id)).toEqual([
      id.stageEvent,
      id.orderEvent,
      id.runEvent,
    ]);
    expect(
      value.activity.items.every(
        (activity) => activity.productionRunId === id.run,
      ),
    ).toBe(true);
    expect(JSON.stringify(value.activity)).not.toContain('_idempotency');
    expect(JSON.stringify(value.activity)).not.toContain('private');
    expect(value.asOf).toBe(asOf.toISOString());
    expect(target.clock).toHaveBeenCalledOnce();
    expect(await durableSnapshot()).toEqual(before);
  });

  it('reads 101 activity rows, returns 100 newest by createdAt/id, and sets hasMore', async () => {
    await seedFullGraph(false);
    const events = Array.from({ length: 101 }, (_, index) => ({
      id: uuid(65000000, index + 1),
      locationId,
      eventType: 'production_run_started',
      entityType: 'production_run',
      entityId: id.run,
      actorId: id.actor,
      idempotencyKey: `history-boundary-${index + 1}`,
      payload: {
        scheduleRunId: id.schedule,
        productionBatchIds: [id.batchZero, id.batchOne],
        queueVersion: 3,
      },
      createdAt: new Date('2026-08-22T19:00:00.000Z'),
    }));
    await database.db.insert(productionTestSchema.workEvents).values(events);
    const outcome = await execute().run({
      locationId,
      productionRunId: id.run,
    });
    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'failure') return;
    expect(outcome.value.activity.items).toHaveLength(100);
    expect(outcome.value.activity.hasMore).toBe(true);
    expect(outcome.value.activity.items.map((activity) => activity.id)).toEqual(
      Array.from({ length: 100 }, (_, index) => uuid(65000000, 101 - index)),
    );
  });
});
