import { auth, eq, laundryProduction } from '@pressly/db';
import { productionHistoryRunDetailSchema } from '@pressly/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeListProductionHistoryRepository } from '../../src/list-production-history/list-production-history.repo.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../support/database.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  actor: '10000000-0000-4000-8000-000000000001',
  shift: '10000000-0000-4000-8000-000000000002',
  config: '10000000-0000-4000-8000-000000000003',
  schedule: '10000000-0000-4000-8000-000000000004',
  run: '10000000-0000-4000-8000-000000000005',
  batch: '10000000-0000-4000-8000-000000000006',
  demand: '10000000-0000-4000-8000-000000000007',
  order: '10000000-0000-4000-8000-000000000008',
  eventOne: '10000000-0000-4000-8000-000000000009',
  eventTwo: '10000000-0000-4000-8000-000000000010',
  siblingEvent: '10000000-0000-4000-8000-000000000011',
  sourceBatch: '10000000-0000-4000-8000-000000000012',
  releasedMembership: '10000000-0000-4000-8000-000000000013',
  currentMembership: '10000000-0000-4000-8000-000000000014',
  siblingDemand: '10000000-0000-4000-8000-000000000015',
  siblingOrder: '10000000-0000-4000-8000-000000000016',
  siblingMembership: '10000000-0000-4000-8000-000000000017',
  resolvedDemand: '10000000-0000-4000-8000-000000000018',
  resolvedOrder: '10000000-0000-4000-8000-000000000019',
  resolvedEvent: '10000000-0000-4000-8000-000000000024',
} as const;

const stages = [
  ['sorting', '10000000-0000-4000-8000-000000000020'],
  ['washing', '10000000-0000-4000-8000-000000000021'],
  ['drying', '10000000-0000-4000-8000-000000000022'],
  ['folding_packaging', '10000000-0000-4000-8000-000000000023'],
] as const;

const now = new Date('2026-07-15T20:00:00.000Z');

const seed = async () => {
  await testDb.db.insert(laundryProduction.productionLocations).values([
    {
      id: 'location-1',
      name: 'History Facility',
      timezone: 'America/New_York',
    },
    {
      id: 'location-2',
      name: 'Sibling Facility',
      timezone: 'America/Chicago',
    },
  ]);
  await testDb.db
    .insert(auth.authIdentities)
    .values({
      id: ids.actor,
      kind: 'human',
      displayName: 'Alex Operator',
      email: 'alex-history@example.com',
      emailNormalized: 'alex-history@example.com',
    })
    .onConflictDoNothing();
  await testDb.db.insert(laundryProduction.productionShifts).values({
    id: ids.shift,
    locationId: 'location-1',
    startsAt: new Date('2026-07-15T12:00:00.000Z'),
    endsAt: new Date('2026-07-15T20:00:00.000Z'),
    timezone: 'America/New_York',
    status: 'closed',
    effectiveFolderCount: 3,
    version: 2,
  });
  await testDb.db.insert(laundryProduction.schedulerConfigs).values({
    id: ids.config,
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
    assertedBy: ids.actor,
  });
  await testDb.db.insert(laundryProduction.scheduleRuns).values({
    id: ids.schedule,
    locationId: 'location-1',
    productionShiftId: ids.shift,
    schedulerConfigId: ids.config,
    status: 'accepted',
    inputSnapshot: { orderIds: [ids.order, ids.siblingOrder] },
    inputSnapshotHash: 'a'.repeat(64),
    outputPlan: { pulseMinutes: 56, batches: [], unplacedOrderIds: [] },
    outputPlanHash: 'b'.repeat(64),
    algorithmVersion: 'fixed-pulse-ffd-v2',
    pulseCapacityLbs: 100,
    batchCount: 2,
    makespanMinutes: 224,
    plannedCompletionAt: new Date('2026-07-15T18:00:00.000Z'),
    warnings: [{ code: 'SHIFT_OVERFLOW' }],
    acknowledgedWarningCodes: ['SHIFT_OVERFLOW'],
    createdAt: new Date('2026-07-15T11:00:00.000Z'),
    acceptedAt: new Date('2026-07-15T11:30:00.000Z'),
    acceptedBy: ids.actor,
  });
  await testDb.db.insert(laundryProduction.productionRuns).values({
    id: ids.run,
    locationId: 'location-1',
    productionShiftId: ids.shift,
    scheduleRunId: ids.schedule,
    status: 'completed',
    startedAt: new Date('2026-07-15T12:00:00.000Z'),
    completedAt: new Date('2026-07-15T18:15:00.000Z'),
    plannedCompletionAt: new Date('2026-07-15T18:00:00.000Z'),
    queueVersion: 2,
    version: 2,
    createdAt: new Date('2026-07-15T12:00:00.000Z'),
  });
  await testDb.db.insert(laundryProduction.productionBatches).values([
    {
      id: ids.sourceBatch,
      locationId: 'location-1',
      productionRunId: ids.run,
      sequenceIndex: 0,
      status: 'finished',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 30,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-07-15T17:00:00.000Z'),
      startedAt: new Date('2026-07-15T12:00:00.000Z'),
      finishedAt: new Date('2026-07-15T17:15:00.000Z'),
      membershipFrozenAt: new Date('2026-07-15T12:00:00.000Z'),
      membershipFrozenBy: ids.actor,
      version: 7,
    },
    {
      id: ids.batch,
      locationId: 'location-1',
      productionRunId: ids.run,
      sequenceIndex: 1,
      status: 'finished',
      pulseCapacityLbs: 100,
      derivedWeightLbs: 80,
      pulseMinutes: 56,
      plannedDoneAt: new Date('2026-07-15T18:00:00.000Z'),
      startedAt: new Date('2026-07-15T13:00:00.000Z'),
      finishedAt: new Date('2026-07-15T18:15:00.000Z'),
      membershipFrozenAt: new Date('2026-07-15T13:00:00.000Z'),
      membershipFrozenBy: ids.actor,
      version: 6,
    },
  ]);
  await seedProductionDemands(testDb.db, [
    {
      id: ids.demand,
      demandKey: 'history-order-demand',
      displayReference: 'C-1001',
      locationId: 'location-1',
      revisionHash: 'revision-1',
      revisionAt: new Date('2026-07-15T10:00:00.000Z'),
      phase: 'production_released',
      sourceStatusCode: 'IN_PROGRESS',
      dueAt: new Date('2026-07-15T20:00:00.000Z'),
    },
    {
      id: ids.siblingDemand,
      demandKey: 'history-sibling-demand',
      displayReference: 'C-1002',
      locationId: 'location-1',
      revisionHash: 'revision-2',
      revisionAt: new Date('2026-07-15T10:00:00.000Z'),
      phase: 'production_released',
      sourceStatusCode: 'IN_PROGRESS',
      dueAt: new Date('2026-07-15T20:00:00.000Z'),
    },
  ]);
  await testDb.db.insert(laundryProduction.productionOrders).values([
    {
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-15T20:00:00.000Z'),
      priority: true,
      operationalStatus: 'finished',
      executionStatus: 'finished',
      derivedWeightLbs: 80,
      derivedWeightSource: 'external_estimate',
      bagCount: 2,
      bagCountSource: 'external_source',
      intakeRecordedAt: new Date('2026-07-15T10:00:00.000Z'),
      intakeVersion: 1,
      eligibleAt: new Date('2026-07-15T10:00:00.000Z'),
      finishedAt: new Date('2026-07-15T18:15:00.000Z'),
      version: 3,
    },
    {
      id: ids.siblingOrder,
      orderDemandId: ids.siblingDemand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-15T20:00:00.000Z'),
      priority: false,
      operationalStatus: 'finished',
      executionStatus: 'finished',
      derivedWeightLbs: 30,
      derivedWeightSource: 'external_estimate',
      bagCount: 1,
      bagCountSource: 'external_source',
      intakeRecordedAt: new Date('2026-07-15T10:00:00.000Z'),
      intakeVersion: 1,
      eligibleAt: new Date('2026-07-15T10:00:00.000Z'),
      finishedAt: new Date('2026-07-15T17:15:00.000Z'),
      version: 2,
    },
  ]);
  await testDb.db.insert(laundryProduction.productionBatchOrders).values([
    {
      id: ids.releasedMembership,
      locationId: 'location-1',
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.order,
      active: false,
      placementProvenance: 'initial_schedule',
      placedAt: new Date('2026-07-15T11:30:00.000Z'),
      releasedAt: new Date('2026-07-15T13:00:00.000Z'),
      releasedBy: ids.actor,
      releaseReason: 'needs_more_drying',
    },
    {
      id: ids.siblingMembership,
      locationId: 'location-1',
      productionBatchId: ids.sourceBatch,
      productionOrderId: ids.siblingOrder,
      active: true,
      placementProvenance: 'initial_schedule',
      placedAt: new Date('2026-07-15T11:30:00.000Z'),
    },
    {
      id: ids.currentMembership,
      locationId: 'location-1',
      productionBatchId: ids.batch,
      productionOrderId: ids.order,
      active: true,
      placementProvenance: 'exception_route',
      placedAt: new Date('2026-07-15T13:00:00.000Z'),
      placedBy: ids.actor,
    },
  ]);
  await testDb.db.insert(laundryProduction.stations).values(
    stages.map(([kind, id], sequence) => ({
      id,
      locationId: 'location-1',
      kind,
      label: kind,
      sortOrder: sequence,
    })),
  );
  await testDb.db.insert(laundryProduction.stageRuns).values(
    stages.map(([kind, stationId], sequence) => ({
      id: `20000000-0000-4000-8000-00000000002${sequence}`,
      locationId: 'location-1',
      productionBatchId: ids.batch,
      stationId,
      stageKind: kind,
      status: 'completed',
      plannedStartAt: new Date(
        Date.parse('2026-07-15T12:00:00.000Z') + sequence * 3_600_000,
      ),
      plannedEndAt: new Date(
        Date.parse('2026-07-15T13:00:00.000Z') + sequence * 3_600_000,
      ),
      actualStartAt: new Date(
        Date.parse('2026-07-15T12:00:00.000Z') + sequence * 3_600_000,
      ),
      actualEndAt: new Date(
        Date.parse('2026-07-15T13:00:00.000Z') + sequence * 3_600_000,
      ),
      actualStartProvenance: 'live_observed' as const,
      actualEndProvenance: 'live_observed' as const,
      startedBy: ids.actor,
      completedBy: ids.actor,
      version: 3,
    })),
  );
  await testDb.db.insert(laundryProduction.workEvents).values([
    {
      id: ids.eventOne,
      locationId: 'location-1',
      eventType: 'production_run_started',
      entityType: 'production_run',
      entityId: ids.run,
      actorId: ids.actor,
      idempotencyKey: 'history-event-run-started',
      payload: {
        scheduleRunId: ids.schedule,
        productionBatchIds: [ids.batch],
        queueVersion: 1,
        _idempotency: { command: { private: true }, result: { private: true } },
      },
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
    },
    {
      id: ids.eventTwo,
      locationId: 'location-1',
      eventType: 'stage_completed',
      entityType: 'stage_run',
      entityId: '20000000-0000-4000-8000-000000000023',
      actorId: ids.actor,
      expectedVersion: 2,
      idempotencyKey: 'history-event-stage-completed',
      payload: { version: 3, _idempotency: { result: { private: true } } },
      createdAt: new Date('2026-07-15T18:15:00.000Z'),
    },
    {
      id: ids.siblingEvent,
      locationId: 'location-2',
      eventType: 'scheduler_config_published',
      entityType: 'scheduler_config',
      entityId: ids.config,
      actorId: ids.actor,
      idempotencyKey: 'history-event-sibling-location',
      payload: { version: 1 },
      createdAt: new Date('2026-07-15T19:00:00.000Z'),
    },
  ]);
};

describe('production history Postgres read model', () => {
  it('keeps pages location-scoped, keyset-stable, and sanitized', async () => {
    await seed();
    const repo = makeListProductionHistoryRepository(testDb.db);
    const first = await repo.listActivity(
      { locationId: 'location-1', runId: ids.run, limit: 1 },
      now,
    );
    expect(first).toMatchObject({
      tag: 'found',
      value: {
        items: [
          {
            id: ids.eventTwo,
            eventType: 'stage_completed',
            productionRunId: ids.run,
            actor: { displayName: 'Alex Operator' },
          },
        ],
      },
    });
    if (first.tag !== 'found' || first.value.nextCursor === null)
      throw new Error('Expected a second activity page.');
    expect(JSON.stringify(first.value)).not.toContain('_idempotency');
    expect(JSON.stringify(first.value)).not.toContain('private');

    const second = await repo.listActivity(
      {
        locationId: 'location-1',
        runId: ids.run,
        limit: 1,
        cursor: first.value.nextCursor,
      },
      now,
    );
    expect(second).toMatchObject({
      tag: 'found',
      value: { items: [{ id: ids.eventOne }], nextCursor: null },
    });

    await expect(
      repo.listActivity(
        {
          locationId: 'location-1',
          eventType: 'stage_completed',
          limit: 50,
        },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: {
        items: [
          {
            id: ids.eventTwo,
            productionRunId: ids.run,
          },
        ],
      },
    });
    await expect(
      repo.listActivity(
        {
          locationId: 'location-1',
          search: 'Alex Operator',
          occurredAfter: '2026-07-15T18:00:00.000Z',
          limit: 50,
        },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: { items: [{ id: ids.eventTwo }] },
    });
  });

  it('offers restore only while the archived order remains resolved', async () => {
    await seed();
    await seedProductionDemands(testDb.db, [
      {
        id: ids.resolvedDemand,
        demandKey: 'history-resolved-demand',
        displayReference: 'C-ARCHIVED-1',
        locationId: 'location-1',
        revisionHash: 'revision-resolved',
        revisionAt: new Date('2026-07-15T10:00:00.000Z'),
        phase: 'expected',
        sourceStatusCode: 'COMPLETED',
        dueAt: new Date('2026-07-14T20:00:00.000Z'),
      },
    ]);
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.resolvedOrder,
      orderDemandId: ids.resolvedDemand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-14T20:00:00.000Z'),
      priority: false,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      resolutionState: 'resolved_without_production',
      resolvedAt: new Date('2026-07-15T19:30:00.000Z'),
      resolvedBy: ids.actor,
      resolutionReason: 'completed_outside_pressly',
      derivedWeightLbs: 12,
      derivedWeightSource: 'external_estimate',
      version: 2,
    });
    await testDb.db.insert(laundryProduction.workEvents).values({
      id: ids.resolvedEvent,
      locationId: 'location-1',
      eventType: 'production_order_resolved_without_production',
      entityType: 'production_order',
      entityId: ids.resolvedOrder,
      actorId: ids.actor,
      expectedVersion: 1,
      idempotencyKey: 'history-event-order-resolved',
      payload: {
        action: 'resolve_without_production',
        resolutionState: 'resolved_without_production',
        reason: 'completed_outside_pressly',
        note: 'private note',
        version: 2,
      },
      createdAt: new Date('2026-07-15T19:30:00.000Z'),
    });
    const repo = makeListProductionHistoryRepository(testDb.db);

    await expect(
      repo.listActivity(
        {
          locationId: 'location-1',
          orderResolution: 'archived',
          limit: 10,
        },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: {
        items: [
          {
            id: ids.resolvedEvent,
            resolutionAction: { action: 'restore', expectedVersion: 2 },
          },
        ],
      },
    });

    await testDb.db
      .update(laundryProduction.productionOrders)
      .set({
        resolutionState: 'open',
        resolvedAt: null,
        resolvedBy: null,
        resolutionReason: null,
        version: 3,
      })
      .where(eq(laundryProduction.productionOrders.id, ids.resolvedOrder));

    await expect(
      repo.listActivity(
        {
          locationId: 'location-1',
          orderResolution: 'archived',
          limit: 10,
        },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: { items: [{ resolutionAction: null }] },
    });
  });

  it('projects run truth, counts, stage provenance, and schedule lineage', async () => {
    await seed();
    const repo = makeListProductionHistoryRepository(testDb.db);
    await expect(
      repo.listRuns({ locationId: 'location-1', limit: 50 }, now),
    ).resolves.toMatchObject({
      tag: 'found',
      value: {
        items: [
          {
            productionRunId: ids.run,
            batchCount: 2,
            orderCount: 2,
          },
        ],
        nextCursor: null,
      },
    });
    await expect(
      repo.listRuns(
        {
          locationId: 'location-1',
          search: ids.shift.slice(0, 12),
          status: 'completed',
          createdAfter: '2026-07-15T11:00:00.000Z',
          limit: 50,
        },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: { items: [{ productionRunId: ids.run }] },
    });
    await expect(
      repo.listPlans(
        { locationId: 'location-1', runId: ids.run, limit: 50 },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: {
        items: [
          {
            scheduleRunId: ids.schedule,
            linkedProductionRunId: ids.run,
          },
        ],
      },
    });
    await expect(
      repo.listPlans(
        {
          locationId: 'location-1',
          search: 'fixed-pulse',
          status: 'accepted',
          createdAfter: '2026-07-15T10:00:00.000Z',
          limit: 50,
        },
        now,
      ),
    ).resolves.toMatchObject({
      tag: 'found',
      value: { items: [{ scheduleRunId: ids.schedule }] },
    });
    const found = await repo.loadRun(
      { locationId: 'location-1', productionRunId: ids.run },
      now,
    );
    expect(found).toMatchObject({
      tag: 'found',
      value: {
        overview: {
          productionRunId: ids.run,
          status: 'completed',
          batchCount: 2,
          completedBatchCount: 2,
          orderCount: 2,
          priorityOrderCount: 1,
          totalWeightLbs: 110,
        },
        batches: [
          { currentOrderCount: 1, historicalOrderCount: 2, status: 'finished' },
          { currentOrderCount: 1, historicalOrderCount: 1, status: 'finished' },
        ],
        stageProgress: { completed: 4 },
        scheduleLineage: {
          executionScheduleRunId: ids.schedule,
          revisions: [
            {
              scheduleRunId: ids.schedule,
              linkedProductionRunId: ids.run,
              warningCount: 1,
              acknowledgedWarningCount: 1,
            },
          ],
        },
        activity: {
          items: [
            {
              id: ids.eventTwo,
              productionRunId: ids.run,
            },
            {
              id: ids.eventOne,
              productionRunId: ids.run,
            },
          ],
          hasMore: false,
        },
      },
    });
    if (found.tag !== 'found') throw new Error('Expected the seeded run.');
    expect(found.value.orderMemberships).toHaveLength(3);
    expect(found.value.orderMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: ids.releasedMembership,
          productionOrderId: ids.order,
          externalOrderId: 'C-1001',
          orderStatus: 'finished',
          derivedWeightLbs: 80,
          bagCount: 2,
          productionBatchId: ids.sourceBatch,
          batchSequence: 0,
          placementProvenance: 'initial_schedule',
          placement: expect.objectContaining({
            state: 'released',
            releasedBy: ids.actor,
            reason: 'needs_more_drying',
          }),
        }),
        expect.objectContaining({
          membershipId: ids.currentMembership,
          productionOrderId: ids.order,
          productionBatchId: ids.batch,
          batchSequence: 1,
          placementProvenance: 'exception_route',
          placement: expect.objectContaining({
            state: 'current',
            placedBy: ids.actor,
          }),
        }),
      ]),
    );
    expect(JSON.stringify(found.value.activity)).not.toContain('_idempotency');
    expect(JSON.stringify(found.value.activity)).not.toContain('private');
    expect(() =>
      productionHistoryRunDetailSchema.parse(found.value),
    ).not.toThrow();
  });
});
