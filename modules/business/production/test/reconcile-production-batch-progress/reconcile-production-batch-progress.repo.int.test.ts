import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { asc, eq, laundryProduction } from '@pressly/db';
import { makeReconcileProductionBatchProgressRepository } from '../../src/reconcile-production-batch-progress/reconcile-production-batch-progress.repo.ts';
import { makeReconcileProductionBatchProgress } from '../../src/reconcile-production-batch-progress/reconcile-production-batch-progress.usecase.ts';
import { createProductionTestDatabase } from '../support/database.ts';
import { allowPolicy, makeIds } from '../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const fixed = {
  actor: '11111111-1111-4111-8111-111111111111',
  shift: '22222222-2222-4222-8222-222222222222',
  config: '33333333-3333-4333-8333-333333333333',
  schedule: '44444444-4444-4444-8444-444444444444',
  run: '55555555-5555-4555-8555-555555555555',
  batch: '66666666-6666-4666-8666-666666666666',
  washer: '77777777-7777-4777-8777-777777777776',
  dryer: '77777777-7777-4777-8777-777777777777',
  demand: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  order: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  bags: [
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
  ],
  stations: [
    '88888888-8888-4888-8888-888888888881',
    '88888888-8888-4888-8888-888888888882',
    '88888888-8888-4888-8888-888888888883',
    '88888888-8888-4888-8888-888888888884',
  ],
  stages: [
    '99999999-9999-4999-8999-999999999991',
    '99999999-9999-4999-8999-999999999992',
    '99999999-9999-4999-8999-999999999993',
    '99999999-9999-4999-8999-999999999994',
  ],
  assignments: [
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd1',
    'dddddddd-dddd-4ddd-8ddd-ddddddddddd2',
  ],
  attempts: [
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee4',
  ],
} as const;

const seed = async () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  const stages = ['sorting', 'washing', 'drying', 'folding_packaging'] as const;
  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: 'location-1',
    name: 'Floor Truth Test Facility',
    timezone: 'America/New_York',
  });
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: fixed.shift,
    locationId: 'location-1',
    startsAt: now,
    endsAt: new Date('2026-07-15T22:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await testDb.db.insert(laundryProduction.stations).values(
    stages.map((kind, index) => ({
      id: fixed.stations[index]!,
      locationId: 'location-1',
      kind,
      label: kind,
      sortOrder: index,
    })),
  );
  await testDb.db.insert(laundryProduction.machines).values([
    {
      id: fixed.washer,
      locationId: 'location-1',
      stationId: fixed.stations[1],
      label: 'Washer 1',
      effectiveCapacityLbs: 100,
      isActive: true,
    },
    {
      id: fixed.dryer,
      locationId: 'location-1',
      stationId: fixed.stations[2],
      label: 'Dryer 1',
      effectiveCapacityLbs: 100,
      isActive: true,
    },
  ]);
  await testDb.db.insert(laundryProduction.schedulerConfigs).values({
    id: fixed.config,
    locationId: 'location-1',
    pulseMinutes: 56,
    foldLbsPerFolderMinute: 2,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    version: 1,
    stageFitAssertion: {
      sortingFits: true,
      washingFits: true,
      dryingFits: true,
    },
    assertedBy: fixed.actor,
  });
  await testDb.db.insert(laundryProduction.scheduleRuns).values({
    id: fixed.schedule,
    locationId: 'location-1',
    productionShiftId: fixed.shift,
    schedulerConfigId: fixed.config,
    status: 'accepted',
    inputSnapshot: {},
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: {},
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 224,
    plannedCompletionAt: new Date('2026-07-15T16:00:00.000Z'),
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: now,
    acceptedBy: fixed.actor,
  });
  await testDb.db.insert(laundryProduction.productionRuns).values({
    id: fixed.run,
    locationId: 'location-1',
    productionShiftId: fixed.shift,
    scheduleRunId: fixed.schedule,
    status: 'started',
    startedAt: now,
    queueVersion: 1,
    plannedCompletionAt: new Date('2026-07-15T16:00:00.000Z'),
    version: 1,
  });
  await testDb.db.insert(laundryProduction.productionBatches).values({
    id: fixed.batch,
    locationId: 'location-1',
    productionRunId: fixed.run,
    sequenceIndex: 0,
    status: 'queued',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 75,
    pulseMinutes: 56,
    plannedDoneAt: new Date('2026-07-15T16:00:00.000Z'),
    version: 1,
  });
  await testDb.db.insert(laundryProduction.stageRuns).values(
    stages.map((stageKind, index) => ({
      id: fixed.stages[index]!,
      locationId: 'location-1',
      productionBatchId: fixed.batch,
      stationId: fixed.stations[index]!,
      stageKind,
      status: 'planned',
      plannedStartAt: new Date(now.getTime() + index * 56 * 60_000),
      plannedEndAt: new Date(now.getTime() + (index + 1) * 56 * 60_000),
      version: 1,
    })),
  );
  await testDb.db.insert(laundryProduction.stageMachineAssignments).values([
    {
      id: fixed.assignments[0],
      locationId: 'location-1',
      stageRunId: fixed.stages[1],
      machineId: fixed.washer,
      plannedStartAt: new Date(now.getTime() + 56 * 60_000),
      plannedEndAt: new Date(now.getTime() + 2 * 56 * 60_000),
      status: 'planned',
    },
    {
      id: fixed.assignments[1],
      locationId: 'location-1',
      stageRunId: fixed.stages[2],
      machineId: fixed.dryer,
      plannedStartAt: new Date(now.getTime() + 2 * 56 * 60_000),
      plannedEndAt: new Date(now.getTime() + 3 * 56 * 60_000),
      status: 'planned',
    },
  ]);
};

const seedScheduledOrder = async () => {
  const now = new Date('2026-07-15T12:00:00.000Z');
  await testDb.db.insert(laundryProduction.orderDemands).values({
    id: fixed.demand,
    demandKey: 'reconciled-order',
    displayReference: 'Reconciled order',
    locationId: 'location-1',
    revisionHash: 'c'.repeat(64),
    revisionAt: now,
    phase: 'production_released',
    sourceStatusCode: 'IN_PROGRESS',
    dueAt: new Date('2026-07-15T20:00:00.000Z'),
  });
  await testDb.db.insert(laundryProduction.productionOrders).values({
    id: fixed.order,
    orderDemandId: fixed.demand,
    locationId: 'location-1',
    dueAt: new Date('2026-07-15T20:00:00.000Z'),
    status: 'scheduled',
    derivedWeightLbs: 75,
    bagCount: 2,
    eligibleAt: now,
  });
  await testDb.db.insert(laundryProduction.bags).values(
    fixed.bags.map((id, bagIndex) => ({
      id,
      productionOrderId: fixed.order,
      bagIndex,
      status: 'eligible',
    })),
  );
  await testDb.db.insert(laundryProduction.productionBatchOrders).values({
    locationId: 'location-1',
    productionBatchId: fixed.batch,
    productionOrderId: fixed.order,
    active: true,
    placementProvenance: 'initial_schedule',
  });
  await testDb.db.insert(laundryProduction.productionOrderStageAttempts).values(
    fixed.stages.map((stageRunId, index) => ({
      id: fixed.attempts[index]!,
      locationId: 'location-1',
      productionRunId: fixed.run,
      productionOrderId: fixed.order,
      stageRunId,
      stageKind: (
        ['sorting', 'washing', 'drying', 'folding_packaging'] as const
      )[index]!,
      attemptNumber: 1,
      status: 'assigned',
      assignmentReason: 'initial_schedule',
      assignedAt: now,
      assignedBy: fixed.actor,
    })),
  );
};

describe('floor progress reconciliation Postgres workflow', () => {
  it('starts the batch and retires skipped machine plans without inventing history', async () => {
    await seed();
    await seedScheduledOrder();
    const reconcile = makeReconcileProductionBatchProgress({
      repo: makeReconcileProductionBatchProgressRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T14:30:00.000Z') },
    });
    const command = {
      locationId: 'location-1',
      productionRunId: fixed.run,
      productionBatchId: fixed.batch,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      expectedStageVersions: fixed.stages.map((stageRunId) => ({
        stageRunId,
        version: 1,
      })),
      target: 'drying_started' as const,
      reason: 'lpms_unavailable' as const,
      machineIds: [fixed.dryer],
      actorId: fixed.actor,
      idempotencyKey: 'reconcile-floor-progress-1',
    };

    const preview = await reconcile(command);
    expect(preview).toMatchObject({
      tag: 'ok',
      value: { status: 'confirmation_required' },
    });
    if (
      preview.tag === 'err' ||
      preview.value.status !== 'confirmation_required'
    )
      return;

    await expect(
      reconcile({ ...command, confirmation: preview.value.confirmation }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'reconciled',
        milestone: 'drying_started',
        queueVersion: 2,
        batchVersion: 2,
        replayed: false,
      },
    });

    const storedStages = await testDb.db
      .select({
        stage: laundryProduction.stageRuns.stageKind,
        status: laundryProduction.stageRuns.status,
        actualStartAt: laundryProduction.stageRuns.actualStartAt,
        actualStartProvenance:
          laundryProduction.stageRuns.actualStartProvenance,
        actualEndAt: laundryProduction.stageRuns.actualEndAt,
        actualEndProvenance: laundryProduction.stageRuns.actualEndProvenance,
        plannedStartAt: laundryProduction.stageRuns.plannedStartAt,
        plannedEndAt: laundryProduction.stageRuns.plannedEndAt,
      })
      .from(laundryProduction.stageRuns)
      .orderBy(asc(laundryProduction.stageRuns.plannedStartAt));
    expect(storedStages).toEqual([
      expect.objectContaining({
        stage: 'sorting',
        status: 'completed',
        actualStartAt: null,
        actualStartProvenance: 'not_recorded',
        actualEndAt: null,
        actualEndProvenance: 'not_recorded',
      }),
      expect.objectContaining({
        stage: 'washing',
        status: 'completed',
        actualStartAt: null,
        actualStartProvenance: 'not_recorded',
        actualEndAt: null,
        actualEndProvenance: 'not_recorded',
        plannedStartAt: new Date('2026-07-15T12:56:00.000Z'),
        plannedEndAt: new Date('2026-07-15T13:52:00.000Z'),
      }),
      expect.objectContaining({
        stage: 'drying',
        status: 'started',
        actualStartAt: null,
        actualStartProvenance: 'not_recorded',
      }),
      expect.objectContaining({
        stage: 'folding_packaging',
        status: 'planned',
      }),
    ]);

    const [storedBatch] = await testDb.db
      .select({
        status: laundryProduction.productionBatches.status,
        version: laundryProduction.productionBatches.version,
        frozenBy: laundryProduction.productionBatches.membershipFrozenBy,
        startedAt: laundryProduction.productionBatches.startedAt,
      })
      .from(laundryProduction.productionBatches)
      .where(eq(laundryProduction.productionBatches.id, fixed.batch));
    expect(storedBatch).toMatchObject({
      status: 'drying',
      version: 2,
      frozenBy: fixed.actor,
      startedAt: new Date('2026-07-15T14:30:00.000Z'),
    });

    const assignments = await testDb.db
      .select()
      .from(laundryProduction.stageMachineAssignments);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      stageRunId: fixed.stages[2],
      machineId: fixed.dryer,
      status: 'active',
      actualStartAt: null,
    });
    expect(assignments).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stageRunId: fixed.stages[1] }),
      ]),
    );
    expect(assignments[0]?.id).not.toBe(fixed.assignments[1]);
    const attempts = await testDb.db
      .select({
        stage: laundryProduction.productionOrderStageAttempts.stageKind,
        status: laundryProduction.productionOrderStageAttempts.status,
        completedAt: laundryProduction.productionOrderStageAttempts.completedAt,
        completedBy: laundryProduction.productionOrderStageAttempts.completedBy,
      })
      .from(laundryProduction.productionOrderStageAttempts)
      .orderBy(asc(laundryProduction.productionOrderStageAttempts.stageRunId));
    expect(attempts).toEqual([
      {
        stage: 'sorting',
        status: 'completed',
        completedAt: new Date('2026-07-15T14:30:00.000Z'),
        completedBy: fixed.actor,
      },
      {
        stage: 'washing',
        status: 'completed',
        completedAt: new Date('2026-07-15T14:30:00.000Z'),
        completedBy: fixed.actor,
      },
      {
        stage: 'drying',
        status: 'assigned',
        completedAt: null,
        completedBy: null,
      },
      {
        stage: 'folding_packaging',
        status: 'assigned',
        completedAt: null,
        completedBy: null,
      },
    ]);
    const events = await testDb.db.select().from(laundryProduction.workEvents);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'batch_progress_reconciled',
      entityType: 'production_batch',
      entityId: fixed.batch,
    });

    await reconcile({ ...command, confirmation: preview.value.confirmation });
    expect(
      await testDb.db.select().from(laundryProduction.workEvents),
    ).toHaveLength(1);
  });

  it('reuses live terminalization when the recorded floor milestone is finished', async () => {
    await seed();
    await seedScheduledOrder();
    const reconcile = makeReconcileProductionBatchProgress({
      repo: makeReconcileProductionBatchProgressRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => new Date('2026-07-15T16:30:00.000Z') },
    });
    const command = {
      locationId: 'location-1',
      productionRunId: fixed.run,
      productionBatchId: fixed.batch,
      expectedQueueVersion: 1,
      expectedBatchVersion: 1,
      expectedStageVersions: fixed.stages.map((stageRunId) => ({
        stageRunId,
        version: 1,
      })),
      target: 'finished' as const,
      reason: 'updates_missed' as const,
      machineIds: [],
      actorId: fixed.actor,
      idempotencyKey: 'reconcile-floor-finished-1',
    };
    const preview = await reconcile(command);
    expect(preview).toMatchObject({
      tag: 'ok',
      value: {
        status: 'confirmation_required',
        effects: {
          finishesBatch: true,
          finishesRun: true,
          closesShift: true,
        },
      },
    });
    if (
      preview.tag === 'err' ||
      preview.value.status !== 'confirmation_required'
    )
      return;

    await expect(
      reconcile({ ...command, confirmation: preview.value.confirmation }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        status: 'reconciled',
        milestone: 'finished',
        finishedOrderCount: 1,
        finishedBagCount: 2,
        runCompleted: true,
        shiftClosed: true,
      },
    });

    const [storedOrder] = await testDb.db
      .select({ status: laundryProduction.productionOrders.status })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, fixed.order));
    const [storedRun] = await testDb.db
      .select({ status: laundryProduction.productionRuns.status })
      .from(laundryProduction.productionRuns)
      .where(eq(laundryProduction.productionRuns.id, fixed.run));
    const [storedShift] = await testDb.db
      .select({ status: laundryProduction.productionShifts.status })
      .from(laundryProduction.productionShifts)
      .where(eq(laundryProduction.productionShifts.id, fixed.shift));
    expect(storedOrder?.status).toBe('finished');
    expect(storedRun?.status).toBe('completed');
    expect(storedShift?.status).toBe('closed');
    const finishedAttempts = await testDb.db
      .select()
      .from(laundryProduction.productionOrderStageAttempts);
    expect(finishedAttempts).toHaveLength(4);
    expect(
      finishedAttempts.every(
        (attempt) =>
          attempt.status === 'completed' &&
          attempt.completedAt?.toISOString() === '2026-07-15T16:30:00.000Z' &&
          attempt.completedBy === fixed.actor,
      ),
    ).toBe(true);
    expect(
      await testDb.db
        .select({ status: laundryProduction.bags.status })
        .from(laundryProduction.bags),
    ).toEqual([{ status: 'finished' }, { status: 'finished' }]);
  });
});
