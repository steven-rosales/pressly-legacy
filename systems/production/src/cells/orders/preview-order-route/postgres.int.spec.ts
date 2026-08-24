import { productionTestSchema } from '../../../testing/production-schema.spec-support.ts';
import { eq, inArray } from '@pressly/postgres/query';
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
import type { OrderRouteProposalCommand } from '../../../model/order-route-proposal/model.ts';
import { makeExecutePreviewOrderRoute } from './execute.ts';
import { makePreviewOrderRoutePostgresRepository } from './postgres.ts';
import type { PreviewOrderRouteSignals } from './types.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
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
  ],
  maxConnections: 4,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const locationId = 'preview-route-location';
const businessId = '00000000-0000-4000-8000-000000000100';
const now = new Date('2026-08-21T12:00:00.000Z');
const shiftEndsAt = new Date('2026-08-21T22:00:00.000Z');
const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  config: '10000000-0000-4000-8000-000000000003',
  schedule: '10000000-0000-4000-8000-000000000004',
  run: '10000000-0000-4000-8000-000000000005',
  sourceBatch: '10000000-0000-4000-8000-000000000006',
  targetBatch: '10000000-0000-4000-8000-000000000007',
  sourceOrder: '10000000-0000-4000-8000-000000000008',
  sourceAnchorOrder: '10000000-0000-4000-8000-000000000009',
  targetOrder: '10000000-0000-4000-8000-000000000010',
  sourceDemand: '10000000-0000-4000-8000-000000000011',
  sourceAnchorDemand: '10000000-0000-4000-8000-000000000012',
  targetDemand: '10000000-0000-4000-8000-000000000013',
  sourceFulfillment: '10000000-0000-4000-8000-000000000017',
  anchorFulfillment: '10000000-0000-4000-8000-000000000018',
  targetFulfillment: '10000000-0000-4000-8000-000000000019',
  sortingStation: '10000000-0000-4000-8000-000000000020',
  washingStation: '10000000-0000-4000-8000-000000000021',
  dryingStation: '10000000-0000-4000-8000-000000000022',
  foldingStation: '10000000-0000-4000-8000-000000000023',
  washer: '10000000-0000-4000-8000-000000000024',
  dryer: '10000000-0000-4000-8000-000000000025',
} as const;

const sourceStages = {
  sorting: '20000000-0000-4000-8000-000000000001',
  washing: '20000000-0000-4000-8000-000000000002',
  drying: '20000000-0000-4000-8000-000000000003',
  folding_packaging: '20000000-0000-4000-8000-000000000004',
} as const;
const targetStages = {
  sorting: '30000000-0000-4000-8000-000000000001',
  washing: '30000000-0000-4000-8000-000000000002',
  drying: '30000000-0000-4000-8000-000000000003',
  folding_packaging: '30000000-0000-4000-8000-000000000004',
} as const;

const stationFor = (stage: (typeof stages)[number]) =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const windowFor = (base: Date, index: number) => ({
  start: new Date(base.getTime() + index * 60 * 60_000),
  end: new Date(base.getTime() + (index + 1) * 60 * 60_000),
});

const seedOrders = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.orderDemands).values(
    (
      [
        [ids.sourceDemand, ids.sourceFulfillment, 'preview-source', 20],
        [ids.sourceAnchorDemand, ids.anchorFulfillment, 'preview-anchor', 10],
        [ids.targetDemand, ids.targetFulfillment, 'preview-target', 40],
      ] as const
    ).map(([id, fulfillmentId, displayReference, weight]) => ({
      id,
      fulfillmentId,
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference,
      locationId,
      revisionAt: now,
      phase: 'production_released',
      estimatedWeightLbs: weight,
      estimatedWeightSource: 'test_estimate',
      dueAt: shiftEndsAt,
    })),
  );
  await database.db.insert(productionTestSchema.productionOrders).values(
    (
      [
        [ids.sourceOrder, ids.sourceDemand, 20],
        [ids.sourceAnchorOrder, ids.sourceAnchorDemand, 10],
        [ids.targetOrder, ids.targetDemand, 40],
      ] as const
    ).map(([id, orderDemandId, weight]) => ({
      id,
      orderDemandId,
      locationId,
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      derivedWeightLbs: weight,
      derivedWeightSource: 'test_estimate',
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      version: 3,
      eligibleAt: now,
    })),
  );
};

const seed = async (): Promise<void> => {
  await database.db.insert(productionTestSchema.productionLocations).values({
    id: locationId,
    businessId,
    name: 'Preview Route Facility',
    timezone: 'America/New_York',
  });
  await database.db.insert(productionTestSchema.productionShifts).values({
    id: ids.shift,
    locationId,
    startsAt: now,
    endsAt: shiftEndsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await database.db.insert(productionTestSchema.stations).values(
    stages.map((stage, index) => ({
      id: stationFor(stage),
      locationId,
      kind: stage,
      label: stage,
      sortOrder: index + 1,
    })),
  );
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
  ]);
  await database.db.insert(productionTestSchema.schedulerConfigs).values({
    id: ids.config,
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
  await database.db.insert(productionTestSchema.scheduleRuns).values({
    id: ids.schedule,
    locationId,
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 480,
    plannedCompletionAt: shiftEndsAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: now,
    acceptedBy: ids.actor,
  });
  await database.db.insert(productionTestSchema.productionRuns).values({
    id: ids.run,
    locationId,
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: now,
    queueVersion: 4,
    plannedCompletionAt: shiftEndsAt,
    version: 1,
  });
  await seedOrders();
  await database.db.insert(productionTestSchema.productionBatches).values([
    {
      id: ids.targetBatch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 40,
      pulseMinutes: 60,
      plannedDoneAt: shiftEndsAt,
      version: 5,
    },
    {
      id: ids.sourceBatch,
      locationId,
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes: 60,
      plannedDoneAt: new Date('2026-08-21T16:00:00.000Z'),
      version: 2,
    },
  ]);
  await database.db.insert(productionTestSchema.productionBatchOrders).values([
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
      productionBatchId: ids.targetBatch,
      productionOrderId: ids.targetOrder,
      placementProvenance: 'initial_schedule',
    },
  ]);

  const targetBase = new Date('2026-08-21T17:00:00.000Z');
  await database.db.insert(productionTestSchema.stageRuns).values([
    ...stages
      .slice()
      .reverse()
      .map((stage) => {
        const index = stages.indexOf(stage);
        const window = windowFor(now, index);
        return {
          id: sourceStages[stage],
          locationId,
          productionBatchId: ids.sourceBatch,
          stationId: stationFor(stage),
          stageKind: stage,
          status: 'planned',
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          version: 1,
        };
      }),
    ...stages
      .slice()
      .reverse()
      .map((stage) => {
        const index = stages.indexOf(stage);
        const window = windowFor(targetBase, index);
        return {
          id: targetStages[stage],
          locationId,
          productionBatchId: ids.targetBatch,
          stationId: stationFor(stage),
          stageKind: stage,
          status: 'planned',
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          version: 1,
        };
      }),
  ]);
  const attemptRows = [
    [ids.sourceOrder, sourceStages],
    [ids.sourceAnchorOrder, sourceStages],
    [ids.targetOrder, targetStages],
  ].flatMap(([productionOrderId, stageIds]) =>
    stages
      .slice()
      .reverse()
      .map((stage) => ({
        locationId,
        productionRunId: ids.run,
        productionOrderId: productionOrderId as string,
        stageRunId: (stageIds as typeof sourceStages)[stage],
        stageKind: stage,
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: now,
        assignedBy: ids.actor,
      })),
  );
  await database.db
    .insert(productionTestSchema.productionOrderStageAttempts)
    .values(attemptRows);
  await database.db.insert(productionTestSchema.stageMachineAssignments).values(
    [sourceStages, targetStages].flatMap((stageIds, batchIndex) =>
      (['washing', 'drying'] as const).map((stage) => {
        const stageIndex = stages.indexOf(stage);
        const window = windowFor(
          batchIndex === 0 ? now : targetBase,
          stageIndex,
        );
        return {
          locationId,
          stageRunId: stageIds[stage],
          machineId: stage === 'washing' ? ids.washer : ids.dryer,
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          status: 'planned',
        };
      }),
    ),
  );
};

const command: OrderRouteProposalCommand = {
  locationId,
  productionRunId: ids.run,
  productionOrderId: ids.sourceOrder,
  actorId: ids.actor,
  authorizedAction: 'production:stage',
  kind: 'queued_move',
  reason: 'manual_rebatch',
  targetProductionBatchId: ids.targetBatch,
  restartStage: 'sorting',
  expectedQueueVersion: 4,
  expectedOrderVersion: 3,
  expectedSourceBatchVersion: 2,
};

const snapshot = async () => ({
  runs: await database.db.select().from(productionTestSchema.productionRuns),
  orders: await database.db
    .select()
    .from(productionTestSchema.productionOrders),
  batches: await database.db
    .select()
    .from(productionTestSchema.productionBatches),
  memberships: await database.db
    .select()
    .from(productionTestSchema.productionBatchOrders),
  attempts: await database.db
    .select()
    .from(productionTestSchema.productionOrderStageAttempts),
  workEvents: await database.db.select().from(productionTestSchema.workEvents),
});

describe('preview order route native Postgres cell', () => {
  it('loads complete, deterministically ordered route facts', async () => {
    await seed();
    const repository = makePreviewOrderRoutePostgresRepository(
      database.db,
      productionTestSchema,
    );

    const loaded = await repository.load({
      locationId,
      productionRunId: ids.run,
      productionOrderId: ids.sourceOrder,
    });

    expect(loaded).not.toBeNull();
    if (loaded === null) return;
    expect(loaded.run).toEqual({
      id: ids.run,
      status: 'started',
      queueVersion: 4,
    });
    expect(loaded.order).toMatchObject({
      id: ids.sourceOrder,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      resolutionState: 'open',
      version: 3,
      weightLbs: 20,
    });
    expect(loaded.source).toMatchObject({
      productionBatchId: ids.sourceBatch,
      sequence: 0,
      status: 'queued',
      membershipFrozen: false,
      version: 2,
      derivedWeightLbs: 30,
      activeOrderCount: 2,
    });
    expect(
      loaded.candidates.map((candidate) => candidate.productionBatchId),
    ).toEqual([ids.sourceBatch, ids.targetBatch]);
    expect(
      loaded.candidates.map((candidate) =>
        candidate.stages.map((stage) => stage.stage),
      ),
    ).toEqual([stages, stages]);
    expect(loaded.attempts.map((attempt) => attempt.stage)).toEqual(stages);
    expect(loaded.attempts.map((attempt) => attempt.status)).toEqual([
      'assigned',
      'assigned',
      'assigned',
      'assigned',
    ]);
    expect(
      loaded.candidates[1]?.stages.map((stage) => ({
        stage: stage.stage,
        assignedWeightLbs: stage.assignedWeightLbs,
        capacityLbs: stage.capacityLbs,
      })),
    ).toEqual(
      stages.map((stage) => ({
        stage,
        assignedWeightLbs: 40,
        capacityLbs: 100,
      })),
    );
  });

  it('evaluates from a read-only snapshot without changing route or work-event state', async () => {
    await seed();
    const orderRouteOutcome =
      vi.fn<PreviewOrderRouteSignals['orderRouteOutcome']>();
    const queueConflict = vi.fn<PreviewOrderRouteSignals['queueConflict']>();
    const execute = makeExecutePreviewOrderRoute({
      repo: makePreviewOrderRoutePostgresRepository(
        database.db,
        productionTestSchema,
      ),
      policy: productionRules,
      signals: { orderRouteOutcome, queueConflict },
    });
    const before = await snapshot();

    await expect(execute(command)).resolves.toMatchObject({
      kind: 'success',
      value: {
        kind: 'queued_move',
        productionRunId: ids.run,
        productionOrderId: ids.sourceOrder,
        sourceProductionBatchId: ids.sourceBatch,
        sourceBatchSequence: 0,
        targetProductionBatchId: ids.targetBatch,
        targetBatchSequence: 1,
        restartStage: 'sorting',
        releasedStages: stages,
        assignedStages: stages,
        orderWeightLbs: 20,
        targetWeightLbs: 60,
        targetCapacityLbs: 100,
        expectedQueueVersion: 4,
        expectedOrderVersion: 3,
        expectedSourceBatchVersion: 2,
        expectedTargetBatchVersion: 5,
        proposalHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    await expect(snapshot()).resolves.toEqual(before);
    expect(orderRouteOutcome).toHaveBeenCalledWith({
      operation: 'preview',
      status: 'proposed',
      kind: 'queued_move',
      reason: 'manual_rebatch',
    });
    expect(queueConflict).not.toHaveBeenCalled();
  });

  it('excludes disabled machine capacity from the target stage graph', async () => {
    await seed();
    await database.db
      .update(productionTestSchema.machines)
      .set({ isActive: false })
      .where(
        inArray(productionTestSchema.machines.id, [ids.washer, ids.dryer]),
      );
    const execute = makeExecutePreviewOrderRoute({
      repo: makePreviewOrderRoutePostgresRepository(
        database.db,
        productionTestSchema,
      ),
      policy: productionRules,
    });

    await expect(execute(command)).resolves.toMatchObject({
      kind: 'failure',
      failure: {
        kind: 'validation',
        classification: 'semantic',
        code: 'target_stage_graph_invalid',
      },
    });
    const [sourceMembership] = await database.db
      .select({ active: productionTestSchema.productionBatchOrders.active })
      .from(productionTestSchema.productionBatchOrders)
      .where(
        eq(
          productionTestSchema.productionBatchOrders.productionOrderId,
          ids.sourceOrder,
        ),
      );
    expect(sourceMembership).toEqual({ active: true });
  });
});
