import { and, eq, laundryProduction } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresProductionApplication } from '../../src/main.ts';
import { createProductionTestDatabase } from '../support/database.ts';
import {
  allowPolicy,
  makeClock,
  makeIds,
  simpleScheduler,
} from '../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const fixed = {
  actor: '11111111-1111-4111-8111-111111111111',
  shift: '22222222-2222-4222-8222-222222222222',
  station: '33333333-3333-4333-8333-333333333333',
  config: '44444444-4444-4444-8444-444444444444',
  schedule: '55555555-5555-4555-8555-555555555555',
  run: '66666666-6666-4666-8666-666666666666',
  batch: '77777777-7777-4777-8777-777777777777',
  stage: '88888888-8888-4888-8888-888888888888',
  attempt: '88888888-8888-4888-8888-888888888889',
  demand: '99999999-9999-4999-8999-999999999999',
  order: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  bag: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
} as const;

const locationId = 'location-1';
const startsAt = '2026-07-14T14:00:00.000Z';
const endsAt = '2026-07-14T22:00:00.000Z';
const stageEndsAt = '2026-07-14T14:56:00.000Z';

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const seedNearlyCompleteRun = async (): Promise<void> => {
  const start = new Date(startsAt);
  const stageEnd = new Date(stageEndsAt);
  await testDb.db.insert(laundryProduction.productionLocations).values({
    id: locationId,
    name: 'Concurrency Test Facility',
    timezone: 'America/New_York',
  });
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: fixed.shift,
    locationId,
    startsAt: start,
    endsAt: new Date(endsAt),
    timezone: 'America/New_York',
    status: 'open',
    effectiveFolderCount: 2,
  });
  await testDb.db.insert(laundryProduction.stations).values({
    id: fixed.station,
    locationId,
    kind: 'folding_packaging',
    label: 'Folding',
    sortOrder: 4,
  });
  await testDb.db.insert(laundryProduction.schedulerConfigs).values({
    id: fixed.config,
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
    assertedBy: fixed.actor,
  });
  const inputSnapshot = {
    orders: [
      {
        id: fixed.order,
        externalOrderId: 'existing-order',
        dueAt: endsAt,
        priority: false,
        derivedWeightLbs: 40,
        bagCount: 1,
        version: 1,
      },
    ],
    machines: [],
    shift: {
      id: fixed.shift,
      startsAt,
      endsAt,
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
      version: 1,
    },
    config: {
      id: fixed.config,
      pulseMinutes: 56,
      foldLbsPerFolderMinute: 2,
      algorithmVersion: 'fixed-pulse-ffd-v2',
      version: 1,
    },
  } as const;
  const outputPlan = {
    algorithmVersion: 'fixed-pulse-ffd-v2',
    inputSnapshotHash: 'a'.repeat(64),
    outputPlanHash: 'b'.repeat(64),
    canonicalOutput: '{}',
    pulseMinutes: 56,
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 56,
    plannedCompletionAt: stageEndsAt,
    batches: [],
    unplacedOrderIds: [],
    warnings: [],
  } as const;
  await testDb.db.insert(laundryProduction.scheduleRuns).values({
    id: fixed.schedule,
    locationId,
    productionShiftId: fixed.shift,
    schedulerConfigId: fixed.config,
    status: 'accepted',
    inputSnapshot,
    inputSnapshotHash: outputPlan.inputSnapshotHash,
    outputPlan,
    outputPlanHash: outputPlan.outputPlanHash,
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 1,
    makespanMinutes: 56,
    plannedCompletionAt: stageEnd,
    warnings: [],
    acknowledgedWarningCodes: [],
    acceptedAt: start,
    acceptedBy: fixed.actor,
  });
  await testDb.db.insert(laundryProduction.productionRuns).values({
    id: fixed.run,
    locationId,
    productionShiftId: fixed.shift,
    scheduleRunId: fixed.schedule,
    status: 'started',
    startedAt: start,
    queueVersion: 1,
    plannedCompletionAt: stageEnd,
    version: 1,
  });
  await testDb.db.insert(laundryProduction.orderDemands).values({
    id: fixed.demand,
    demandKey: 'existing-order',
    displayReference: 'existing-order',
    locationId,
    revisionHash: 'c'.repeat(64),
    revisionAt: start,
    phase: 'production_released',
    sourceStatusCode: 'IN_PROGRESS',
    dueAt: new Date(endsAt),
  });
  await testDb.db.insert(laundryProduction.productionOrders).values({
    id: fixed.order,
    orderDemandId: fixed.demand,
    locationId,
    dueAt: new Date(endsAt),
    status: 'scheduled',
    derivedWeightLbs: 40,
    bagCount: 1,
    eligibleAt: start,
  });
  await testDb.db.insert(laundryProduction.bags).values({
    id: fixed.bag,
    productionOrderId: fixed.order,
    bagIndex: 0,
    status: 'eligible',
  });
  await testDb.db.insert(laundryProduction.productionBatches).values({
    id: fixed.batch,
    locationId,
    productionRunId: fixed.run,
    sequenceIndex: 0,
    status: 'folding_packaging',
    pulseCapacityLbs: 100,
    derivedWeightLbs: 40,
    pulseMinutes: 56,
    plannedDoneAt: stageEnd,
    startedAt: start,
    membershipFrozenAt: start,
    membershipFrozenBy: fixed.actor,
    version: 1,
  });
  await testDb.db.insert(laundryProduction.productionBatchOrders).values({
    locationId,
    productionBatchId: fixed.batch,
    productionOrderId: fixed.order,
    active: true,
    placementProvenance: 'initial_schedule',
  });
  await testDb.db.insert(laundryProduction.stageRuns).values({
    id: fixed.stage,
    locationId,
    productionBatchId: fixed.batch,
    stationId: fixed.station,
    stageKind: 'folding_packaging',
    status: 'started',
    plannedStartAt: start,
    plannedEndAt: stageEnd,
    actualStartAt: start,
    actualStartProvenance: 'live_observed',
    startedBy: fixed.actor,
    version: 1,
  });
  await testDb.db
    .insert(laundryProduction.productionOrderStageAttempts)
    .values({
      id: fixed.attempt,
      locationId,
      productionRunId: fixed.run,
      productionOrderId: fixed.order,
      stageRunId: fixed.stage,
      stageKind: 'folding_packaging',
      attemptNumber: 1,
      status: 'assigned',
      assignmentReason: 'initial_schedule',
      assignedAt: start,
      assignedBy: fixed.actor,
    });
};

const holdRunLock = async () => {
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
      .where(eq(laundryProduction.productionRuns.id, fixed.run))
      .for('update');
    signalAcquired();
    await released;
  });
  await acquired;
  return { release: signalRelease, done };
};

describe('production aggregate races', () => {
  it('completes the run ahead of an already-arrived order without losing the arrival', async () => {
    await seedNearlyCompleteRun();
    const application = makePostgresProductionApplication({
      db: testDb.db,
      policy: allowPolicy,
      scheduler: simpleScheduler,
      clock: makeClock('2026-07-14T15:00:00.000Z').clock,
      ids: makeIds(),
    });
    const blocker = await holdRunLock();
    const completion = application.advanceProductionStage({
      locationId,
      stageRunId: fixed.stage,
      expectedVersion: 1,
      transition: 'complete',
      actorId: fixed.actor,
      idempotencyKey: 'race-final-completion',
    });
    await delay(30);
    const arrival = application.applyOrderDemand({
      demandKey: 'arriving-during-completion',
      displayReference: 'arriving-during-completion',
      locationId,
      revisionAt: '2026-07-14T14:59:00.000Z',
      revisionHash: 'd'.repeat(64),
      phase: 'production_released',
      sourceStatusCode: 'IN_PROGRESS',
      dueAt: endsAt,
      estimatedWeightLbs: 20,
      estimatedWeightSource: 'external_estimate',
      bagCount: 1,
      idempotencyKey: 'race-arrival-demand',
    });

    let arrivingOrderId: string | null = null;
    for (let attempt = 0; attempt < 40 && arrivingOrderId === null; attempt++) {
      const [stored] = await testDb.db
        .select({ id: laundryProduction.productionOrders.id })
        .from(laundryProduction.productionOrders)
        .innerJoin(
          laundryProduction.orderDemands,
          and(
            eq(
              laundryProduction.orderDemands.id,
              laundryProduction.productionOrders.orderDemandId,
            ),
            eq(
              laundryProduction.orderDemands.demandKey,
              'arriving-during-completion',
            ),
          ),
        );
      arrivingOrderId = stored?.id ?? null;
      if (arrivingOrderId === null) await delay(5);
    }
    await delay(30);
    blocker.release();

    const [, completionResult, arrivalResult] = await Promise.all([
      blocker.done,
      completion,
      arrival,
    ]);
    expect(arrivingOrderId).not.toBeNull();
    expect(completionResult).toMatchObject({ tag: 'ok' });
    expect(arrivalResult).toMatchObject({
      tag: 'ok',
      value: { outcome: 'applied', productionOrderId: arrivingOrderId },
    });

    const [run] = await testDb.db
      .select()
      .from(laundryProduction.productionRuns)
      .where(eq(laundryProduction.productionRuns.id, fixed.run));
    const [shift] = await testDb.db
      .select()
      .from(laundryProduction.productionShifts)
      .where(eq(laundryProduction.productionShifts.id, fixed.shift));
    const [arrivingOrder] = await testDb.db
      .select()
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, arrivingOrderId!));
    const arrivingMemberships = await testDb.db
      .select()
      .from(laundryProduction.productionBatchOrders)
      .where(
        eq(
          laundryProduction.productionBatchOrders.productionOrderId,
          arrivingOrderId!,
        ),
      );
    const arrivingBags = await testDb.db
      .select()
      .from(laundryProduction.bags)
      .where(eq(laundryProduction.bags.productionOrderId, arrivingOrderId!));
    const [completedAttempt] = await testDb.db
      .select()
      .from(laundryProduction.productionOrderStageAttempts)
      .where(
        eq(laundryProduction.productionOrderStageAttempts.id, fixed.attempt),
      );

    expect(run).toMatchObject({ status: 'completed', version: 2 });
    expect(shift).toMatchObject({ status: 'closed', version: 2 });
    expect(arrivingOrder).toMatchObject({
      status: 'eligible',
      bagCount: 1,
    });
    expect(arrivingOrder?.pendingPlacement).toBeNull();
    expect(arrivingMemberships).toEqual([]);
    expect(completedAttempt).toMatchObject({
      status: 'completed',
      completedAt: new Date('2026-07-14T15:00:00.000Z'),
      completedBy: fixed.actor,
    });
    expect(arrivingBags).toEqual([
      expect.objectContaining({ bagIndex: 0, status: 'eligible' }),
    ]);
  });
});
