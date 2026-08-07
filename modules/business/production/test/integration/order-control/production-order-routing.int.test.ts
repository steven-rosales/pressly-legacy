import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { productionRules } from '../../../src/foundations/language/rules/production-rules.factory.ts';
import { makeAdvanceProductionStageRepository } from '../../../src/features/floor/advance-stage/advance-production-stage.repo.ts';
import { makeAdvanceProductionStage } from '../../../src/features/floor/advance-stage/advance-production-stage.usecase.ts';
import { makeListProductionOrderControlRepository } from '../../../src/features/orders/list-order-control/list-production-order-control.repo.ts';
import { makeRouteProductionOrderRepository } from '../../../src/features/orders/route-order/route-production-order.repo.ts';
import type { RouteProductionOrderRepository } from '../../../src/features/orders/route-order/route-production-order.port.ts';
import { makeRouteProductionOrder } from '../../../src/features/orders/route-order/route-production-order.usecase.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../../support/database.ts';
import { makeClock, makeIds } from '../../support/production.fake.ts';

const testDb = createProductionTestDatabase();

const synchronizeFirstWorkEventMisses = (
  repository: RouteProductionOrderRepository,
) => {
  let firstMissCount = 0;
  let releaseBoth: () => void = () => undefined;
  const bothMissed = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  const synchronized: RouteProductionOrderRepository = {
    transaction: (work) =>
      repository.transaction((operations) => {
        let firstLookup = true;
        return work({
          ...operations,
          findWorkEvent: async (idempotencyKey) => {
            const stored = await operations.findWorkEvent(idempotencyKey);
            if (!firstLookup || stored !== null) return stored;

            firstLookup = false;
            firstMissCount += 1;
            if (firstMissCount === 2) releaseBoth();
            await bothMissed;
            return null;
          },
        });
      }),
  };
  return {
    repository: synchronized,
    firstMissCount: () => firstMissCount,
  } as const;
};

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

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
  sortingStation: '10000000-0000-4000-8000-000000000014',
  washingStation: '10000000-0000-4000-8000-000000000015',
  dryingStation: '10000000-0000-4000-8000-000000000016',
  foldingStation: '10000000-0000-4000-8000-000000000017',
  washer: '10000000-0000-4000-8000-000000000018',
  dryer: '10000000-0000-4000-8000-000000000019',
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

const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
const startsAt = new Date('2026-07-14T14:00:00.000Z');
const shiftEndsAt = new Date('2026-07-15T02:00:00.000Z');
const pulseMinutes = 60;

const stationFor = (stage: (typeof stages)[number]) =>
  ({
    sorting: ids.sortingStation,
    washing: ids.washingStation,
    drying: ids.dryingStation,
    folding_packaging: ids.foldingStation,
  })[stage];

const windowFor = (base: Date, index: number) => ({
  start: new Date(base.getTime() + index * pulseMinutes * 60_000),
  end: new Date(base.getTime() + (index + 1) * pulseMinutes * 60_000),
});

const seed = async () => {
  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: 'location-1',
    businessId: '00000000-0000-4000-8000-000000000100',
    name: 'Route Capacity Test Facility',
    timezone: 'America/New_York',
  });
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: ids.shift,
    locationId: 'location-1',
    startsAt,
    endsAt: shiftEndsAt,
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await testDb.db.insert(laundryProduction.stations).values(
    stages.map((stage, index) => ({
      id: stationFor(stage),
      locationId: 'location-1',
      kind: stage,
      label: stage,
      sortOrder: index + 1,
    })),
  );
  await testDb.db.insert(laundryProduction.machines).values([
    {
      id: ids.washer,
      locationId: 'location-1',
      stationId: ids.washingStation,
      label: 'Washer 1',
      effectiveCapacityLbs: 50,
    },
    {
      id: ids.dryer,
      locationId: 'location-1',
      stationId: ids.dryingStation,
      label: 'Dryer 1',
      effectiveCapacityLbs: 50,
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
  const plannedCompletionAt = new Date('2026-07-14T22:00:00.000Z');
  const inputSnapshot = {
    orders: [],
    machines: [],
    shift: {
      id: ids.shift,
      startsAt: startsAt.toISOString(),
      endsAt: shiftEndsAt.toISOString(),
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
    makespanMinutes: 300,
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
    inputSnapshotHash: outputPlan.inputSnapshotHash,
    outputPlan,
    outputPlanHash: outputPlan.outputPlanHash,
    algorithmVersion: outputPlan.algorithmVersion,
    pulseCapacityLbs: outputPlan.pulseCapacityLbs,
    batchCount: outputPlan.batchCount,
    makespanMinutes: outputPlan.makespanMinutes,
    plannedCompletionAt,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: startsAt,
    acceptedBy: ids.actor,
  });
  await testDb.db.insert(laundryProduction.productionRuns).values({
    id: ids.run,
    locationId: 'location-1',
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'started',
    startedAt: startsAt,
    queueVersion: 1,
    plannedCompletionAt,
    version: 1,
  });
  await seedProductionDemands(testDb.db, [
    {
      id: ids.sourceDemand,
      demandKey: 'route-capacity:source',
      displayReference: 'source-order',
      locationId: 'location-1',
      revisionHash: 'c'.repeat(64),
      revisionAt: startsAt,
      phase: 'production_released',
      dueAt: shiftEndsAt,
    },
    {
      id: ids.sourceAnchorDemand,
      demandKey: 'route-capacity:source-anchor',
      displayReference: 'source-anchor-order',
      locationId: 'location-1',
      revisionHash: 'd'.repeat(64),
      revisionAt: startsAt,
      phase: 'production_released',
      dueAt: shiftEndsAt,
    },
    {
      id: ids.targetDemand,
      demandKey: 'route-capacity:target',
      displayReference: 'target-order',
      locationId: 'location-1',
      revisionHash: 'e'.repeat(64),
      revisionAt: startsAt,
      phase: 'production_released',
      dueAt: shiftEndsAt,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionOrders).values([
    {
      id: ids.sourceOrder,
      orderDemandId: ids.sourceDemand,
      locationId: 'location-1',
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 20,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
    },
    {
      id: ids.sourceAnchorOrder,
      orderDemandId: ids.sourceAnchorDemand,
      locationId: 'location-1',
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 10,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
    },
    {
      id: ids.targetOrder,
      orderDemandId: ids.targetDemand,
      locationId: 'location-1',
      dueAt: shiftEndsAt,
      operationalStatus: 'scheduled',
      executionStatus: 'scheduled',
      derivedWeightLbs: 40,
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      eligibleAt: startsAt,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionBatches).values([
    {
      id: ids.sourceBatch,
      locationId: 'location-1',
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'queued',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes,
      plannedDoneAt: new Date('2026-07-14T18:00:00.000Z'),
      version: 1,
    },
    {
      id: ids.targetBatch,
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
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.sourceOrder,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId: 'location-1',
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.sourceAnchorOrder,
      placementProvenance: 'initial_schedule',
    },
    {
      locationId: 'location-1',
      productionBatchId: ids.targetBatch,
      productionOrderId: ids.targetOrder,
      placementProvenance: 'initial_schedule',
    },
  ]);

  const sourceBase = startsAt;
  const targetBase = new Date('2026-07-14T18:00:00.000Z');
  await testDb.db.insert(laundryProduction.stageRuns).values([
    ...stages.map((stage, index) => {
      const window = windowFor(sourceBase, index);
      return {
        id: sourceStages[stage],
        locationId: 'location-1',
        productionBatchId: ids.sourceBatch,
        stationId: stationFor(stage),
        stageKind: stage,
        status: 'planned',
        plannedStartAt: window.start,
        plannedEndAt: window.end,
        version: 1,
      };
    }),
    ...stages.map((stage, index) => {
      const window = windowFor(targetBase, index);
      return {
        id: targetStages[stage],
        locationId: 'location-1',
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
  await testDb.db.insert(laundryProduction.productionOrderStageAttempts).values(
    [
      [ids.sourceOrder, sourceStages],
      [ids.sourceAnchorOrder, sourceStages],
      [ids.targetOrder, targetStages],
    ].flatMap(([productionOrderId, stageIds]) =>
      stages.map((stage) => ({
        locationId: 'location-1',
        productionRunId: ids.run,
        productionOrderId: productionOrderId as string,
        stageRunId: (stageIds as typeof sourceStages)[stage],
        stageKind: stage,
        attemptNumber: 1,
        status: 'assigned',
        assignmentReason: 'initial_schedule',
        assignedAt: startsAt,
        assignedBy: ids.actor,
      })),
    ),
  );
  await testDb.db.insert(laundryProduction.stageMachineAssignments).values([
    ...[sourceStages, targetStages].flatMap((stageIds, batchIndex) =>
      (['washing', 'drying'] as const).map((stage, stageIndex) => {
        const window = windowFor(
          batchIndex === 0 ? sourceBase : targetBase,
          stageIndex + 1,
        );
        return {
          locationId: 'location-1',
          stageRunId: stageIds[stage],
          machineId: stage === 'washing' ? ids.washer : ids.dryer,
          plannedStartAt: window.start,
          plannedEndAt: window.end,
          status: 'planned',
        };
      }),
    ),
  ]);
};

const routeCommand = {
  locationId: 'location-1',
  productionRunId: ids.run,
  productionOrderId: ids.sourceOrder,
  actorId: ids.actor,
  authorizedAction: 'production:stage' as const,
  kind: 'queued_move' as const,
  reason: 'manual_rebatch' as const,
  restartStage: 'sorting' as const,
  targetProductionBatchId: ids.targetBatch,
  expectedQueueVersion: 1,
  expectedOrderVersion: 1,
  expectedSourceBatchVersion: 1,
};

describe('route production order repository', () => {
  it('rejects a route that would exceed the target planned machine capacity', async () => {
    await seed();
    const route = makeRouteProductionOrder({
      repo: makeRouteProductionOrderRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: productionRules,
      clock: { now: () => new Date('2026-07-14T17:30:00.000Z') },
    });
    const preview = await route.preview(routeCommand);
    expect(preview).toMatchObject({
      tag: 'err',
      error: { code: 'hard_capacity_exceeded', kind: 'validation' },
    });

    const control = await makeListProductionOrderControlRepository({
      db: testDb.db,
      policy: productionRules,
    }).list(
      { locationId: 'location-1', view: 'all', limit: 25 },
      new Date('2026-07-14T17:30:00.000Z'),
    );
    expect(control.tag).toBe('found');
    if (control.tag !== 'found') return;
    expect(
      control.value.items.find((item) => item.order.id === ids.sourceOrder)
        ?.commands.queuedMove,
    ).toMatchObject({
      status: 'blocked',
      code: 'NO_FEASIBLE_TARGET',
      targets: expect.arrayContaining([
        expect.objectContaining({
          productionBatchId: ids.targetBatch,
          capacityLbs: 50,
          feasibility: {
            status: 'blocked',
            code: 'HARD_CAPACITY_EXCEEDED',
          },
        }),
      ]),
    });

    const [batch] = await testDb.db
      .select({
        weightLbs: laundryProduction.productionBatches.derivedWeightLbs,
      })
      .from(laundryProduction.productionBatches)
      .where(eq(laundryProduction.productionBatches.id, ids.targetBatch));
    expect(batch?.weightLbs).toBe(40);
  });

  it('keeps an in-flight source graph valid while checking planned target capacity', async () => {
    await seed();
    const sourceStartedAt = new Date('2026-07-14T14:00:00.000Z');
    await testDb.db
      .update(laundryProduction.productionBatches)
      .set({
        status: 'washing',
        startedAt: sourceStartedAt,
        membershipFrozenAt: sourceStartedAt,
        membershipFrozenBy: ids.actor,
      })
      .where(eq(laundryProduction.productionBatches.id, ids.sourceBatch));
    await testDb.db
      .update(laundryProduction.stageRuns)
      .set({
        status: 'completed',
        actualStartAt: sourceStartedAt,
        actualEndAt: new Date('2026-07-14T15:00:00.000Z'),
        actualStartProvenance: 'live_observed',
        actualEndProvenance: 'live_observed',
        startedBy: ids.actor,
        completedBy: ids.actor,
        version: 3,
      })
      .where(eq(laundryProduction.stageRuns.id, sourceStages.sorting));
    await testDb.db
      .update(laundryProduction.stageRuns)
      .set({
        status: 'started',
        actualStartAt: new Date('2026-07-14T15:00:00.000Z'),
        actualStartProvenance: 'live_observed',
        startedBy: ids.actor,
        version: 2,
      })
      .where(eq(laundryProduction.stageRuns.id, sourceStages.washing));
    await testDb.db
      .update(laundryProduction.stageMachineAssignments)
      .set({
        status: 'active',
        actualStartAt: new Date('2026-07-14T15:00:00.000Z'),
      })
      .where(
        eq(
          laundryProduction.stageMachineAssignments.stageRunId,
          sourceStages.washing,
        ),
      );
    await testDb.db
      .update(laundryProduction.productionOrderStageAttempts)
      .set({
        status: 'completed',
        completedAt: new Date('2026-07-14T15:00:00.000Z'),
        completedBy: ids.actor,
      })
      .where(
        eq(
          laundryProduction.productionOrderStageAttempts.stageRunId,
          sourceStages.sorting,
        ),
      );

    const route = makeRouteProductionOrder({
      repo: makeRouteProductionOrderRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: productionRules,
      clock: { now: () => new Date('2026-07-14T15:30:00.000Z') },
    });
    await expect(
      route.preview({
        ...routeCommand,
        kind: 'exception',
        reason: 'rewash_required',
        restartStage: 'washing',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'hard_capacity_exceeded', kind: 'validation' },
    });
  });

  it('does not count a disabled planned machine as usable route capacity', async () => {
    await seed();
    await testDb.db
      .update(laundryProduction.machines)
      .set({ isActive: false, effectiveCapacityLbs: 100 })
      .where(eq(laundryProduction.machines.id, ids.washer));

    const route = makeRouteProductionOrder({
      repo: makeRouteProductionOrderRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: productionRules,
      clock: { now: () => new Date('2026-07-14T17:30:00.000Z') },
    });
    await expect(route.preview(routeCommand)).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'target_stage_graph_invalid', kind: 'validation' },
    });
  });

  it('commits once and replays once after concurrent retries both miss initially', async () => {
    await seed();
    await testDb.db
      .update(laundryProduction.machines)
      .set({ effectiveCapacityLbs: 100 })
      .where(inArray(laundryProduction.machines.id, [ids.washer, ids.dryer]));

    const barrier = synchronizeFirstWorkEventMisses(
      makeRouteProductionOrderRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
    );
    const route = makeRouteProductionOrder({
      repo: barrier.repository,
      policy: productionRules,
      clock: { now: () => new Date('2026-07-14T17:30:00.000Z') },
    });
    const preview = await route.preview(routeCommand);
    expect(preview.tag).toBe('ok');
    if (preview.tag !== 'ok') return;
    const command = {
      ...routeCommand,
      proposalHash: preview.value.proposalHash,
      idempotencyKey: 'route-order-concurrent-identical-retry',
    };

    const outcomes = await Promise.all([
      route.commit(command),
      route.commit(command),
    ]);

    expect(barrier.firstMissCount()).toBe(2);
    expect(outcomes).toEqual([
      expect.objectContaining({
        tag: 'ok',
        value: expect.objectContaining({
          queueVersion: 2,
          orderVersion: 2,
          sourceBatchVersion: 2,
          targetBatchVersion: 2,
        }),
      }),
      expect.objectContaining({
        tag: 'ok',
        value: expect.objectContaining({
          queueVersion: 2,
          orderVersion: 2,
          sourceBatchVersion: 2,
          targetBatchVersion: 2,
        }),
      }),
    ]);
    const replayed = outcomes.flatMap((outcome) =>
      outcome.tag === 'ok' ? [outcome.value.replayed] : [],
    );
    expect(replayed.sort()).toEqual([false, true]);

    const memberships = await testDb.db
      .select({
        productionBatchId:
          laundryProduction.productionBatchOrders.productionBatchId,
        active: laundryProduction.productionBatchOrders.active,
      })
      .from(laundryProduction.productionBatchOrders)
      .where(
        eq(
          laundryProduction.productionBatchOrders.productionOrderId,
          ids.sourceOrder,
        ),
      );
    expect(memberships).toEqual(
      expect.arrayContaining([
        { productionBatchId: ids.sourceBatch, active: false },
        { productionBatchId: ids.targetBatch, active: true },
      ]),
    );

    const attempts = await testDb.db
      .select({ status: laundryProduction.productionOrderStageAttempts.status })
      .from(laundryProduction.productionOrderStageAttempts)
      .where(
        eq(
          laundryProduction.productionOrderStageAttempts.productionOrderId,
          ids.sourceOrder,
        ),
      );
    expect(
      attempts.filter((attempt) => attempt.status === 'released'),
    ).toHaveLength(4);
    expect(
      attempts.filter((attempt) => attempt.status === 'assigned'),
    ).toHaveLength(4);

    const events = await testDb.db
      .select({ id: laundryProduction.workEvents.id })
      .from(laundryProduction.workEvents)
      .where(
        eq(laundryProduction.workEvents.idempotencyKey, command.idempotencyKey),
      );
    expect(events).toHaveLength(1);
  });

  it('blocks a legacy under-capacity machine plan at stage start', async () => {
    await seed();
    await testDb.db
      .update(laundryProduction.productionBatches)
      .set({
        status: 'sorting',
        derivedWeightLbs: 60,
        startedAt: new Date('2026-07-14T18:00:00.000Z'),
        membershipFrozenAt: new Date('2026-07-14T18:00:00.000Z'),
        membershipFrozenBy: ids.actor,
      })
      .where(eq(laundryProduction.productionBatches.id, ids.targetBatch));
    await testDb.db
      .update(laundryProduction.stageRuns)
      .set({ status: 'completed', version: 2 })
      .where(eq(laundryProduction.stageRuns.id, targetStages.sorting));

    const clock = makeClock('2026-07-14T19:00:00.000Z');
    const advance = makeAdvanceProductionStage({
      repo: makeAdvanceProductionStageRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: productionRules,
      clock: clock.clock,
    });
    await expect(
      advance({
        locationId: 'location-1',
        stageRunId: targetStages.washing,
        expectedVersion: 1,
        actorId: ids.actor,
        transition: 'start',
        idempotencyKey: 'start-undercapacity-target-washing',
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'machine_capacity_insufficient', kind: 'conflict' },
    });
  });
});
