import type { ProductionRules } from '../../../../src/foundations/language/rules/production-rules.model.ts';
import type { ProductionAlgorithmRegistry } from '../../../../src/foundations/algorithms/approved-production/production-algorithm-registry.factory.ts';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { asc, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { makePlaceProductionOrderRepository } from '../../../../src/features/scheduling/place-order/place-production-order.repo.ts';
import type { PlaceProductionOrderRepository } from '../../../../src/features/scheduling/place-order/place-production-order.port.ts';
import { makePlaceProductionOrder } from '../../../../src/features/scheduling/place-order/place-production-order.usecase.ts';
import { makeManageBatchMembershipRepository } from '../../../../src/features/floor/manage-batch-membership/manage-batch-membership.repo.ts';
import { makeManageBatchMembership } from '../../../../src/features/floor/manage-batch-membership/manage-batch-membership.usecase.ts';
import { lockLocationScheduling } from '../../../../src/foundations/adapters/postgres/commands/scheduling-locks.adapter.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../../../support/database.ts';
import { allowPolicy, makeIds } from '../../../support/production.fake.ts';
import { nullProductionSignals } from '../../../../src/foundations/adapters/signals/null-production-signals.adapter.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  actor: '11111111-1111-4111-8111-111111111111',
  shift: '22222222-2222-4222-8222-222222222222',
  config: '33333333-3333-4333-8333-333333333333',
  schedule: '44444444-4444-4444-8444-444444444444',
  run: '55555555-5555-4555-8555-555555555555',
  frozenBatch: '66666666-6666-4666-8666-666666666666',
  mutableBatch: '77777777-7777-4777-8777-777777777777',
  frozenOrder: '88888888-8888-4888-8888-888888888888',
  queuedOrder: '99999999-9999-4999-8999-999999999999',
  arrivingOrder: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  frozenDemand: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  queuedDemand: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  arrivingDemand: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  sortingStation: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  washingStation: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  dryingStation: '12121212-1212-4212-8212-121212121212',
  foldingStation: '13131313-1313-4313-8313-131313131313',
  washer: '45454545-4545-4545-8545-454545454545',
  dryer: '46464646-4646-4646-8646-464646464646',
  frozenStage: '14141414-1414-4414-8414-141414141414',
  queuedSorting: '15151515-1515-4515-8515-151515151515',
  queuedWashing: '16161616-1616-4616-8616-161616161616',
  queuedDrying: '17171717-1717-4717-8717-171717171717',
  queuedFolding: '18181818-1818-4818-8818-181818181818',
  secondShift: '19191919-1919-4919-8919-191919191919',
  secondSchedule: '20202020-2020-4020-8020-202020202020',
  secondRun: '21212121-2121-4121-8121-212121212121',
} as const;

const startsAt = '2026-07-14T14:00:00.000Z';
const shiftEndsAt = '2026-07-14T22:00:00.000Z';
const pulseMinutes = 56;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const holdRunLock = async (productionRunId: string) => {
  let signalAcquired: () => void = () => undefined;
  let signalRelease: () => void = () => undefined;
  const acquired = new Promise<void>((resolve) => {
    signalAcquired = resolve;
  });
  const released = new Promise<void>((resolve) => {
    signalRelease = resolve;
  });
  const done = testDb.db.transaction(async (transaction) => {
    await transaction
      .select({ id: laundryProduction.productionRuns.id })
      .from(laundryProduction.productionRuns)
      .where(eq(laundryProduction.productionRuns.id, productionRunId))
      .for('update');
    signalAcquired();
    await released;
  });
  await acquired;
  return { release: signalRelease, done };
};

const stageProjection = (base: string) =>
  (['sorting', 'washing', 'drying', 'folding_packaging'] as const).map(
    (stage, index) => ({
      stage,
      startsAt: new Date(
        Date.parse(base) + index * pulseMinutes * 60_000,
      ).toISOString(),
      endsAt: new Date(
        Date.parse(base) + (index + 1) * pulseMinutes * 60_000,
      ).toISOString(),
      machineIds: [],
    }),
  );

const stationId = (
  stage: ReturnType<typeof stageProjection>[number]['stage'],
) =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const seed = async () => {
  const createdAt = new Date(startsAt);
  const plannedCompletionAt = new Date('2026-07-14T19:36:00.000Z');
  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: 'location-1',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Placement Test Facility',
    timezone: 'America/New_York',
  });
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: ids.shift,
    locationId: 'location-1',
    startsAt: createdAt,
    endsAt: new Date(shiftEndsAt),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await testDb.db.insert(laundryProduction.stations).values([
    {
      id: ids.sortingStation,
      locationId: 'location-1',
      kind: 'sorting',
      label: 'Sorting',
      sortOrder: 1,
    },
    {
      id: ids.washingStation,
      locationId: 'location-1',
      kind: 'washing',
      label: 'Washing',
      sortOrder: 2,
    },
    {
      id: ids.dryingStation,
      locationId: 'location-1',
      kind: 'drying',
      label: 'Drying',
      sortOrder: 3,
    },
    {
      id: ids.foldingStation,
      locationId: 'location-1',
      kind: 'folding_packaging',
      label: 'Folding',
      sortOrder: 4,
    },
  ]);
  await testDb.db.insert(laundryProduction.machines).values([
    {
      id: ids.washer,
      locationId: 'location-1',
      stationId: ids.washingStation,
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
    },
    {
      id: ids.dryer,
      locationId: 'location-1',
      stationId: ids.dryingStation,
      label: 'Dryer 1',
      effectiveCapacityLbs: 100,
    },
  ]);
  await testDb.db.insert(laundryProduction.schedulerConfigs).values({
    id: ids.config,
    locationId: 'location-1',
    pulseMinutes,
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

  const inputSnapshot = {
    orders: [],
    machines: [],
    shift: {
      id: ids.shift,
      startsAt,
      endsAt: shiftEndsAt,
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: ids.config,
      pulseMinutes,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
    },
  };
  const outputPlan = {
    algorithmVersion: 'fixed-pulse-ffd-v2',
    inputSnapshotHash: 'a'.repeat(64),
    outputPlanHash: 'b'.repeat(64),
    canonicalOutput: '{}',
    pulseMinutes,
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 336,
    plannedCompletionAt: plannedCompletionAt.toISOString(),
    batches: [],
    unplacedOrderIds: [],
    warnings: [],
  };
  await testDb.db.insert(laundryProduction.scheduleRuns).values({
    id: ids.schedule,
    locationId: 'location-1',
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot,
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan,
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 336,
    plannedCompletionAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: createdAt,
    acceptedBy: ids.actor,
  });
  await testDb.db.insert(laundryProduction.productionRuns).values({
    id: ids.run,
    locationId: 'location-1',
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: createdAt,
    queueVersion: 1,
    plannedCompletionAt,
    version: 1,
  });

  await seedProductionDemands(testDb.db, [
    {
      id: ids.frozenDemand,
      demandKey: 'placement:frozen',
      displayReference: 'frozen-order',
      locationId: 'location-1',
      revisionHash: 'c'.repeat(64),
      revisionAt: createdAt,
      phase: 'production_released',
      dueAt: new Date(shiftEndsAt),
    },
    {
      id: ids.queuedDemand,
      demandKey: 'placement:queued',
      displayReference: 'queued-order',
      locationId: 'location-1',
      revisionHash: 'd'.repeat(64),
      revisionAt: createdAt,
      phase: 'production_released',
      dueAt: new Date(shiftEndsAt),
    },
    {
      id: ids.arrivingDemand,
      demandKey: 'placement:arriving',
      displayReference: 'arriving-order',
      locationId: 'location-1',
      revisionHash: 'e'.repeat(64),
      revisionAt: createdAt,
      phase: 'production_released',
      dueAt: new Date(shiftEndsAt),
    },
  ]);
  await testDb.db.insert(laundryProduction.productionOrders).values([
    {
      id: ids.frozenOrder,
      orderDemandId: ids.frozenDemand,
      locationId: 'location-1',
      dueAt: new Date(shiftEndsAt),
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 50,
      bagCount: 2,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: createdAt,
    },
    {
      id: ids.queuedOrder,
      orderDemandId: ids.queuedDemand,
      locationId: 'location-1',
      dueAt: new Date(shiftEndsAt),
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 40,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: createdAt,
    },
    {
      id: ids.arrivingOrder,
      orderDemandId: ids.arrivingDemand,
      locationId: 'location-1',
      dueAt: new Date(shiftEndsAt),
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 20,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: createdAt,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionBatches).values([
    {
      id: ids.frozenBatch,
      locationId: 'location-1',
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'sorting',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 50,
      pulseMinutes,
      plannedDoneAt: new Date('2026-07-14T17:44:00.000Z'),
      startedAt: createdAt,
      membershipFrozenAt: createdAt,
      membershipFrozenBy: ids.actor,
      version: 2,
    },
    {
      id: ids.mutableBatch,
      locationId: 'location-1',
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 40,
      pulseMinutes,
      plannedDoneAt: plannedCompletionAt,
      version: 1,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionBatchOrders).values([
    {
      locationId: 'location-1',
      productionBatchId: ids.frozenBatch,
      productionOrderId: ids.frozenOrder,
      active: true,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId: 'location-1',
      productionBatchId: ids.mutableBatch,
      productionOrderId: ids.queuedOrder,
      active: true,
      placementProvenance: 'initial_schedule',
    },
  ]);
  await testDb.db.insert(laundryProduction.stageRuns).values({
    id: ids.frozenStage,
    locationId: 'location-1',
    productionBatchId: ids.frozenBatch,
    stationId: ids.sortingStation,
    stageKind: 'sorting',
    status: 'started',
    plannedStartAt: createdAt,
    plannedEndAt: new Date('2026-07-14T14:56:00.000Z'),
    actualStartAt: createdAt,
    actualStartProvenance: 'live_observed',
    startedBy: ids.actor,
    version: 2,
  });
  const queuedStageIds = [
    ids.queuedSorting,
    ids.queuedWashing,
    ids.queuedDrying,
    ids.queuedFolding,
  ];
  const queuedStages = stageProjection('2026-07-14T14:56:00.000Z');
  await testDb.db.insert(laundryProduction.stageRuns).values(
    queuedStages.map((stage, index) => ({
      id: queuedStageIds[index]!,
      locationId: 'location-1',
      productionBatchId: ids.mutableBatch,
      stationId: stationId(stage.stage),
      stageKind: stage.stage,
      status: 'planned',
      plannedStartAt: new Date(stage.startsAt),
      plannedEndAt: new Date(stage.endsAt),
      version: 1,
    })),
  );
  await testDb.db.insert(laundryProduction.stageMachineAssignments).values(
    queuedStages
      .filter((stage) => stage.stage === 'washing' || stage.stage === 'drying')
      .map((stage) => ({
        locationId: 'location-1',
        stageRunId:
          stage.stage === 'washing' ? ids.queuedWashing : ids.queuedDrying,
        machineId: stage.stage === 'washing' ? ids.washer : ids.dryer,
        plannedStartAt: new Date(stage.startsAt),
        plannedEndAt: new Date(stage.endsAt),
        status: 'planned',
      })),
  );
};

const seedCompetingRunProvenance = async () => {
  const secondStartsAt = new Date('2026-07-14T23:00:00.000Z');
  const secondEndsAt = new Date('2026-07-15T05:00:00.000Z');
  const secondCompletionAt = new Date('2026-07-15T02:44:00.000Z');
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: ids.secondShift,
    locationId: 'location-1',
    startsAt: secondStartsAt,
    endsAt: secondEndsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  const inputSnapshot = {
    orders: [],
    machines: [],
    shift: {
      id: ids.secondShift,
      startsAt: secondStartsAt.toISOString(),
      endsAt: secondEndsAt.toISOString(),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: ids.config,
      pulseMinutes,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
    },
  };
  const outputPlan = {
    algorithmVersion: 'fixed-pulse-ffd-v2',
    inputSnapshotHash: '6'.repeat(64),
    outputPlanHash: '7'.repeat(64),
    canonicalOutput: '{}',
    pulseMinutes,
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 224,
    plannedCompletionAt: secondCompletionAt.toISOString(),
    batches: [],
    unplacedOrderIds: [],
    warnings: [],
  };
  await testDb.db.insert(laundryProduction.scheduleRuns).values({
    id: ids.secondSchedule,
    locationId: 'location-1',
    productionShiftId: ids.secondShift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot,
    inputSnapshotHash: outputPlan.inputSnapshotHash,
    outputPlan,
    outputPlanHash: outputPlan.outputPlanHash,
    algorithmVersion: outputPlan.algorithmVersion,
    pulseCapacityLbs: outputPlan.pulseCapacityLbs,
    batchCount: outputPlan.batchCount,
    makespanMinutes: outputPlan.makespanMinutes,
    plannedCompletionAt: secondCompletionAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: secondStartsAt,
    acceptedBy: ids.actor,
  });

  return { secondStartsAt, secondCompletionAt };
};

describe('place production order Postgres commit', () => {
  it('holds unique-run selection stable through the run-locked placement commit', async () => {
    await seed();
    const { secondStartsAt, secondCompletionAt } =
      await seedCompetingRunProvenance();
    const baseRepository = makePlaceProductionOrderRepository({
      db: testDb.db,
      ids: makeIds(),
    });
    let signalRunsRead: () => void = () => undefined;
    const runsRead = new Promise<void>((resolve) => {
      signalRunsRead = resolve;
    });
    const repository: PlaceProductionOrderRepository = {
      transaction: (work) =>
        baseRepository.transaction((repo) =>
          work({
            ...repo,
            findStartedRuns: async (locationId) => {
              const runs = await repo.findStartedRuns(locationId);
              signalRunsRead();
              return runs;
            },
          }),
        ),
    };
    const projectedCompletionAt = '2026-07-14T20:32:00.000Z';
    const proposal = {
      kind: 'proposed' as const,
      algorithmVersion: 'online-stable-insertion-v1' as const,
      inputSnapshotHash: '8'.repeat(64),
      placementPlanHash: '9'.repeat(64),
      canonicalPlacement: '{}',
      expectedQueueVersion: 1,
      target: {
        type: 'existing_batch' as const,
        batchId: ids.mutableBatch,
        sequence: 1,
      },
      affectedFromSequence: 1,
      affectedBatches: [
        {
          sourceBatchId: ids.mutableBatch,
          sequence: 1,
          status: 'queued' as const,
          membershipFrozen: false,
          orderIds: [ids.queuedOrder, ids.arrivingOrder],
          priorityOrderIds: [],
          derivedWeightLbs: 60,
          bagCount: 2,
          stages: stageProjection('2026-07-14T15:52:00.000Z'),
          changed: true,
        },
      ],
      projectedCompletionAt,
      overtime: {
        required: false,
        shiftEndsAt,
        overrunMinutes: 0,
      },
    };
    const place = makePlaceProductionOrder({
      repo: repository,
      policy: {
        ...allowPolicy,
        evaluatePlacementCommit: () => ({
          tag: 'ok' as const,
          value: { commit: true as const },
        }),
      } satisfies ProductionRules,
      scheduler: {
        proposeOnlinePlacement: () => proposal,
      } as unknown as ProductionAlgorithmRegistry,
      clock: { now: () => new Date('2026-07-14T15:30:00.000Z') },
      signals: nullProductionSignals,
    });

    const blocker = await holdRunLock(ids.run);
    const automaticPlacement = place.attemptAutomaticPlacement({
      locationId: 'location-1',
      productionOrderId: ids.arrivingOrder,
      actorId: ids.actor,
      authorizedAction: 'production:queue',
      idempotencyKey: 'race-safe-unique-run-placement',
    });
    await runsRead;

    let signalCompetingStart: () => void = () => undefined;
    const competingStartEntered = new Promise<void>((resolve) => {
      signalCompetingStart = resolve;
    });
    const competingRunStart = testDb.db.transaction(async (transaction) => {
      signalCompetingStart();
      await lockLocationScheduling(transaction, 'location-1');
      await transaction.insert(laundryProduction.productionRuns).values({
        id: ids.secondRun,
        locationId: 'location-1',
        productionShiftId: ids.secondShift,
        scheduleRunId: ids.secondSchedule,
        status: 'started',
        startedAt: secondStartsAt,
        queueVersion: 1,
        plannedCompletionAt: secondCompletionAt,
        version: 1,
      });
    });
    await competingStartEntered;

    try {
      await delay(30);
      const competingRunsBeforeRelease = await testDb.db
        .select({ id: laundryProduction.productionRuns.id })
        .from(laundryProduction.productionRuns)
        .where(eq(laundryProduction.productionRuns.id, ids.secondRun));
      expect(competingRunsBeforeRelease).toEqual([]);
    } finally {
      blocker.release();
    }

    const [placementResult] = await Promise.all([
      automaticPlacement,
      blocker.done,
      competingRunStart,
    ]);
    expect(placementResult).toMatchObject({
      tag: 'ok',
      value: {
        status: 'placed',
        productionRunId: ids.run,
        productionOrderId: ids.arrivingOrder,
        queueVersion: 2,
      },
    });
    await expect(
      testDb.db
        .select({ id: laundryProduction.productionRuns.id })
        .from(laundryProduction.productionRuns)
        .where(eq(laundryProduction.productionRuns.id, ids.secondRun)),
    ).resolves.toEqual([{ id: ids.secondRun }]);
  });

  it('persists reload-safe overtime and ambiguous-run pending state', async () => {
    await seed();
    const repository = makePlaceProductionOrderRepository({
      db: testDb.db,
      ids: makeIds(),
    });
    const proposal = {
      kind: 'proposed' as const,
      algorithmVersion: 'online-stable-insertion-v1' as const,
      inputSnapshotHash: 'f'.repeat(64),
      placementPlanHash: '2'.repeat(64),
      canonicalPlacement: '{}',
      expectedQueueVersion: 1,
      target: {
        type: 'new_batch' as const,
        insertAtSequence: 2,
      },
      affectedFromSequence: 2,
      affectedBatches: [
        {
          sourceBatchId: null,
          sequence: 2,
          status: 'queued' as const,
          membershipFrozen: false,
          orderIds: [ids.arrivingOrder],
          priorityOrderIds: [],
          derivedWeightLbs: 20,
          bagCount: 1,
          stages: stageProjection('2026-07-14T19:36:00.000Z'),
          changed: true,
        },
      ],
      projectedCompletionAt: '2026-07-14T23:20:00.000Z',
      overtime: {
        required: true,
        shiftEndsAt,
        overrunMinutes: 80,
      },
    };
    const result = {
      status: 'confirmation_required' as const,
      mode: 'automatic' as const,
      productionRunId: ids.run,
      productionOrderId: ids.arrivingOrder,
      target: { kind: 'new_batch' as const, sequence: 2 },
      affectedBatchIds: [],
      queueVersion: 1,
      proposalHash: proposal.placementPlanHash,
      projectedCompletionAt: proposal.projectedCompletionAt,
      overtimeMinutes: 80,
      replayed: false as const,
    };
    await repository.transaction((repo) =>
      repo.recordOutcome({
        locationId: 'location-1',
        productionRunId: ids.run,
        productionOrderId: ids.arrivingOrder,
        actorId: ids.actor,
        authorizedAction: 'production:queue',
        idempotencyKey: 'pending-overtime-postgres',
        idempotency: {
          operation: 'production_order_placed_automatically',
          locationId: 'location-1',
          actorId: ids.actor,
          target: {
            entityType: 'production_order',
            entityId: ids.arrivingOrder,
          },
          expectedVersion: 1,
          payload: {},
        },
        result,
        proposal,
        mode: 'automatic',
        targetBatchId: null,
        now: new Date('2026-07-14T15:30:00.000Z'),
      }),
    );

    let [order] = await testDb.db
      .select({
        pendingPlacement: laundryProduction.productionOrders.pendingPlacement,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.arrivingOrder));
    expect(order?.pendingPlacement).toMatchObject({
      status: 'confirmation_required',
      proposalHash: proposal.placementPlanHash,
      queueVersion: 1,
      projectedCompletionAt: proposal.projectedCompletionAt,
    });

    const secondRunId = '19191919-1919-4919-8919-191919191919';
    await repository.transaction((repo) =>
      repo.recordPendingRunResolution({
        locationId: 'location-1',
        productionOrderId: ids.arrivingOrder,
        actorId: ids.actor,
        idempotencyKey: 'pending-ambiguous-postgres',
        placement: {
          status: 'ambiguous_run',
          reason: 'multiple_started_runs',
          message: 'Choose a production run.',
          candidateProductionRunIds: [ids.run, secondRunId],
        },
        now: new Date('2026-07-14T15:31:00.000Z'),
      }),
    );
    [order] = await testDb.db
      .select({
        pendingPlacement: laundryProduction.productionOrders.pendingPlacement,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.arrivingOrder));
    expect(order?.pendingPlacement).toEqual({
      status: 'ambiguous_run',
      reason: 'multiple_started_runs',
      message: 'Choose a production run.',
      candidateProductionRunIds: [ids.run, secondRunId],
    });
  });

  it('pins exact placement while preserving every existing membership', async () => {
    await seed();
    const projectedCompletionAt = '2026-07-14T20:32:00.000Z';
    const proposal = {
      kind: 'proposed' as const,
      algorithmVersion: 'online-stable-insertion-v1' as const,
      inputSnapshotHash: 'f'.repeat(64),
      placementPlanHash: '1'.repeat(64),
      canonicalPlacement: '{}',
      expectedQueueVersion: 1,
      target: {
        type: 'existing_batch' as const,
        batchId: ids.mutableBatch,
        sequence: 1,
      },
      affectedFromSequence: 1,
      affectedBatches: [
        {
          sourceBatchId: ids.mutableBatch,
          sequence: 1,
          status: 'queued' as const,
          membershipFrozen: false,
          orderIds: [ids.queuedOrder, ids.arrivingOrder],
          priorityOrderIds: [],
          derivedWeightLbs: 60,
          bagCount: 2,
          stages: stageProjection('2026-07-14T15:52:00.000Z'),
          changed: true,
        },
      ],
      projectedCompletionAt,
      overtime: {
        required: false,
        shiftEndsAt,
        overrunMinutes: 0,
      },
    };
    const scheduler = {
      proposeOnlinePlacement: vi.fn(() => proposal),
    } as unknown as ProductionAlgorithmRegistry;
    const policy = {
      ...allowPolicy,
      evaluatePlacementCommit: vi.fn(() => ({
        tag: 'ok' as const,
        value: { commit: true as const },
      })),
    } satisfies ProductionRules;
    const place = makePlaceProductionOrder({
      repo: makePlaceProductionOrderRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy,
      scheduler,
      clock: { now: () => new Date('2026-07-14T15:30:00.000Z') },
      signals: nullProductionSignals,
    });

    const command = {
      locationId: 'location-1',
      productionRunId: ids.run,
      productionBatchId: ids.mutableBatch,
      productionOrderId: ids.arrivingOrder,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      actorId: ids.actor,
      authorizedAction: 'production:override' as const,
      idempotencyKey: 'exact-placement-postgres',
    };
    await expect(place.placeExactly(command)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'placed',
        mode: 'manager_exact',
        productionBatchId: ids.mutableBatch,
        queueVersion: 2,
        proposalHash: proposal.placementPlanHash,
      },
    });
    await expect(place.placeExactly(command)).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'placed',
        productionBatchId: ids.mutableBatch,
        queueVersion: 2,
        proposalHash: proposal.placementPlanHash,
        replayed: true,
      },
    });

    const memberships = await testDb.db
      .select()
      .from(laundryProduction.productionBatchOrders)
      .orderBy(asc(laundryProduction.productionBatchOrders.productionOrderId));
    expect(memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productionBatchId: ids.frozenBatch,
          productionOrderId: ids.frozenOrder,
          placementProvenance: 'initial_schedule',
          pinnedAt: null,
          pinnedBy: null,
        }),
        expect.objectContaining({
          productionBatchId: ids.mutableBatch,
          productionOrderId: ids.queuedOrder,
          placementProvenance: 'initial_schedule',
          pinnedAt: null,
          pinnedBy: null,
        }),
        expect.objectContaining({
          productionBatchId: ids.mutableBatch,
          productionOrderId: ids.arrivingOrder,
          placementProvenance: 'manager_exact',
          pinnedBy: ids.actor,
        }),
      ]),
    );
    expect(
      memberships
        .find(
          (membership) => membership.productionOrderId === ids.arrivingOrder,
        )
        ?.pinnedAt?.toISOString(),
    ).toBe('2026-07-14T15:30:00.000Z');

    const batches = await testDb.db
      .select()
      .from(laundryProduction.productionBatches)
      .orderBy(asc(laundryProduction.productionBatches.sequenceIndex));
    expect(batches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ids.frozenBatch,
          sequenceIndex: 0,
          status: 'sorting',
          derivedWeightLbs: 50,
          version: 2,
        }),
        expect.objectContaining({
          id: ids.mutableBatch,
          sequenceIndex: 1,
          status: 'queued',
          derivedWeightLbs: 60,
          version: 2,
        }),
      ]),
    );
    const frozenStages = await testDb.db
      .select({ id: laundryProduction.stageRuns.id })
      .from(laundryProduction.stageRuns)
      .where(
        eq(laundryProduction.stageRuns.productionBatchId, ids.frozenBatch),
      );
    expect(frozenStages).toEqual([{ id: ids.frozenStage }]);

    const [run] = await testDb.db
      .select()
      .from(laundryProduction.productionRuns)
      .where(eq(laundryProduction.productionRuns.id, ids.run));
    const [arrivingOrder] = await testDb.db
      .select()
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.arrivingOrder));
    expect(run).toMatchObject({
      queueVersion: 2,
      overtimeProposalHash: null,
    });
    expect(run?.plannedCompletionAt.toISOString()).toBe(projectedCompletionAt);
    expect(arrivingOrder).toMatchObject({
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      version: 2,
    });
  });

  it('serializes freeze ahead of a competing exact placement without partial membership', async () => {
    await seed();
    const sharedIds = makeIds();
    const projectedCompletionAt = '2026-07-14T20:32:00.000Z';
    const proposal = {
      kind: 'proposed' as const,
      algorithmVersion: 'online-stable-insertion-v1' as const,
      inputSnapshotHash: 'f'.repeat(64),
      placementPlanHash: '3'.repeat(64),
      canonicalPlacement: '{}',
      expectedQueueVersion: 1,
      target: {
        type: 'existing_batch' as const,
        batchId: ids.mutableBatch,
        sequence: 1,
      },
      affectedFromSequence: 1,
      affectedBatches: [
        {
          sourceBatchId: ids.mutableBatch,
          sequence: 1,
          status: 'queued' as const,
          membershipFrozen: false,
          orderIds: [ids.queuedOrder, ids.arrivingOrder],
          priorityOrderIds: [],
          derivedWeightLbs: 60,
          bagCount: 2,
          stages: stageProjection('2026-07-14T15:52:00.000Z'),
          changed: true,
        },
      ],
      projectedCompletionAt,
      overtime: {
        required: false,
        shiftEndsAt,
        overrunMinutes: 0,
      },
    };
    const racePolicy = {
      ...allowPolicy,
      evaluatePlacementCommit: () => ({
        tag: 'ok' as const,
        value: { commit: true as const },
      }),
      evaluateBatchMembershipTransition: () => ({
        tag: 'ok' as const,
        value: { membershipFrozen: true as const },
      }),
    } satisfies ProductionRules;
    const place = makePlaceProductionOrder({
      repo: makePlaceProductionOrderRepository({
        db: testDb.db,
        ids: sharedIds,
      }),
      policy: racePolicy,
      scheduler: {
        proposeOnlinePlacement: () => proposal,
      } as unknown as ProductionAlgorithmRegistry,
      clock: { now: () => new Date('2026-07-14T15:30:00.000Z') },
      signals: nullProductionSignals,
    });
    const manage = makeManageBatchMembership({
      repo: makeManageBatchMembershipRepository({
        db: testDb.db,
        ids: sharedIds,
      }),
      policy: racePolicy,
      clock: { now: () => new Date('2026-07-14T15:30:00.000Z') },
      signals: nullProductionSignals,
    });

    const blocker = await holdRunLock(ids.run);
    const freeze = manage({
      action: 'freeze',
      locationId: 'location-1',
      productionRunId: ids.run,
      productionBatchId: ids.mutableBatch,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      actorId: ids.actor,
      authorizedAction: 'production:queue',
      idempotencyKey: 'race-freeze-first',
    });
    await delay(30);
    const placement = place.placeExactly({
      locationId: 'location-1',
      productionRunId: ids.run,
      productionBatchId: ids.mutableBatch,
      productionOrderId: ids.arrivingOrder,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      actorId: ids.actor,
      authorizedAction: 'production:override',
      idempotencyKey: 'race-placement-second',
    });
    await delay(30);
    blocker.release();

    const [, freezeResult, placementResult] = await Promise.all([
      blocker.done,
      freeze,
      placement,
    ]);
    expect(freezeResult).toMatchObject({
      tag: 'ok',
      value: { queueVersion: 2, batchVersion: 2 },
    });
    expect(placementResult).toMatchObject({
      tag: 'ok',
      value: {
        status: 'not_placed',
        reason: 'queue_conflict',
        queueVersion: 2,
      },
    });

    const [storedBatch] = await testDb.db
      .select()
      .from(laundryProduction.productionBatches)
      .where(eq(laundryProduction.productionBatches.id, ids.mutableBatch));
    const arrivingMembership = await testDb.db
      .select()
      .from(laundryProduction.productionBatchOrders)
      .where(
        eq(
          laundryProduction.productionBatchOrders.productionOrderId,
          ids.arrivingOrder,
        ),
      );
    const [arrivingOrder] = await testDb.db
      .select()
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.arrivingOrder));
    expect(storedBatch).toMatchObject({
      version: 2,
      membershipFrozenBy: ids.actor,
      derivedWeightLbs: 40,
    });
    expect(arrivingMembership).toEqual([]);
    expect(arrivingOrder).toMatchObject({
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      version: 1,
    });
  });
});
