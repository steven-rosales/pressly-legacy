import { and, eq, laundryProduction } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeReviewProductionOrderBacklogRepository } from '../../src/review-production-order-backlog/review-production-order-backlog.repo.ts';
import {
  makeCommitProductionOrderBacklog,
  makePreviewProductionOrderBacklog,
} from '../../src/review-production-order-backlog/review-production-order-backlog.usecase.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../support/database.ts';
import { allowPolicy, makeIds } from '../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  readyDemand: '10000000-0000-4000-8000-000000000201',
  readyOrder: '20000000-0000-4000-8000-000000000201',
  openDemand: '10000000-0000-4000-8000-000000000202',
  openOrder: '20000000-0000-4000-8000-000000000202',
  actor: '40000000-0000-4000-8000-000000000201',
  pageDemand1: '10000000-0000-4000-8000-000000000211',
  pageOrder1: '20000000-0000-4000-8000-000000000211',
  pageDemand2: '10000000-0000-4000-8000-000000000212',
  pageOrder2: '20000000-0000-4000-8000-000000000212',
  pageDemand3: '10000000-0000-4000-8000-000000000213',
  pageOrder3: '20000000-0000-4000-8000-000000000213',
  evidenceDemand1: '10000000-0000-4000-8000-000000000221',
  evidenceOrder1: '20000000-0000-4000-8000-000000000221',
  evidenceDemand2: '10000000-0000-4000-8000-000000000222',
  evidenceOrder2: '20000000-0000-4000-8000-000000000222',
  evidenceShift: '30000000-0000-4000-8000-000000000221',
  evidenceConfig: '50000000-0000-4000-8000-000000000221',
  evidenceSchedule: '60000000-0000-4000-8000-000000000221',
  evidenceEvent: '70000000-0000-4000-8000-000000000221',
} as const;

describe('production order backlog Postgres workflow', () => {
  it('reviews every old canonical order and commits its exact safe snapshot', async () => {
    const now = new Date('2026-07-27T04:00:00.000Z');
    const dueAt = new Date('2026-06-01T12:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      name: 'Backlog Test Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, [
      {
        id: ids.readyDemand,
        demandKey: 'test:backlog:ready',
        displayReference: 'BACKLOG-READY',
        locationId: 'location-1',
        revisionHash: 'backlog-ready',
        revisionAt: dueAt,
        phase: 'post_production',
        sourceStatusCode: 'COMPLETED',
        estimatedWeightLbs: 24,
        estimatedWeightSource: 'external_price',
        dueAt,
      },
      {
        id: ids.openDemand,
        demandKey: 'test:backlog:open',
        displayReference: 'BACKLOG-OPEN',
        locationId: 'location-1',
        revisionHash: 'backlog-open',
        revisionAt: dueAt,
        phase: 'expected',
        sourceStatusCode: 'SUBMITTED',
        estimatedWeightLbs: 18,
        estimatedWeightSource: 'external_price',
        dueAt,
      },
    ]);
    await testDb.db.insert(laundryProduction.productionOrders).values([
      {
        id: ids.readyOrder,
        orderDemandId: ids.readyDemand,
        locationId: 'location-1',
        dueAt,
        operationalStatus: 'ineligible',
        executionStatus: 'unassigned',
        derivedWeightLbs: 24,
      },
      {
        id: ids.openOrder,
        orderDemandId: ids.openDemand,
        locationId: 'location-1',
        dueAt,
        operationalStatus: 'release_pending',
        executionStatus: 'unassigned',
        derivedWeightLbs: 18,
      },
    ]);

    const idPort = makeIds();
    const repo = makeReviewProductionOrderBacklogRepository({
      db: testDb.db,
      ids: idPort,
    });
    const preview = makePreviewProductionOrderBacklog({
      repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const commit = makeCommitProductionOrderBacklog({
      repo,
      policy: allowPolicy,
      clock: { now: () => now },
      ids: idPort,
    });
    const scope = {
      locationId: 'location-1',
      filter: 'all_due_before_cutoff' as const,
      cutoff: '2026-07-01T00:00:00.000Z',
      reason: 'completed_outside_pressly' as const,
      cursor: null,
      maxOrders: 250,
    };

    const reviewed = await preview(scope);
    expect(reviewed).toMatchObject({
      tag: 'ok',
      value: {
        candidateCount: 2,
        groups: {
          readyToArchive: [
            { orderId: ids.readyOrder },
            { orderId: ids.openOrder },
          ],
        },
      },
    });
    if (reviewed.tag === 'err') throw reviewed.error;

    const committed = await commit({
      ...scope,
      note: 'Manager reviewed old active Pressly orders.',
      previewHash: reviewed.value.previewHash,
      idempotencyKey: 'backlog-postgres-201',
      actorId: ids.actor,
    });
    expect(committed).toMatchObject({
      tag: 'ok',
      value: {
        resolvedCount: 2,
        resolved: [
          { orderId: ids.readyOrder, version: 2 },
          { orderId: ids.openOrder, version: 2 },
        ],
      },
    });
    if (committed.tag === 'err') throw committed.error;

    const orders = await testDb.db
      .select({
        id: laundryProduction.productionOrders.id,
        resolutionState: laundryProduction.productionOrders.resolutionState,
        bulkOperationId:
          laundryProduction.productionOrders.resolutionBulkOperationId,
        executionStatus: laundryProduction.productionOrders.executionStatus,
      })
      .from(laundryProduction.productionOrders)
      .where(
        and(
          eq(laundryProduction.productionOrders.locationId, 'location-1'),
          eq(
            laundryProduction.productionOrders.resolutionState,
            'resolved_without_production',
          ),
        ),
      );
    expect(orders).toHaveLength(2);
    expect(orders).toEqual(
      expect.arrayContaining([
        {
          id: ids.readyOrder,
          resolutionState: 'resolved_without_production',
          bulkOperationId: committed.value.bulkOperationId,
          executionStatus: 'unassigned',
        },
        {
          id: ids.openOrder,
          resolutionState: 'resolved_without_production',
          bulkOperationId: committed.value.bulkOperationId,
          executionStatus: 'unassigned',
        },
      ]),
    );

    const events = await testDb.db
      .select({
        type: laundryProduction.workEvents.eventType,
        entityId: laundryProduction.workEvents.entityId,
      })
      .from(laundryProduction.workEvents)
      .where(eq(laundryProduction.workEvents.locationId, 'location-1'));
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'production_order_bulk_resolved_without_production',
          entityId: ids.readyOrder,
        },
        {
          type: 'production_order_bulk_resolved_without_production',
          entityId: ids.openOrder,
        },
        {
          type: 'production_order_backlog_bulk_resolution_committed',
          entityId: committed.value.bulkOperationId,
        },
      ]),
    );
  });

  it('replays concurrent identical backlog commits after the location lock', async () => {
    const now = new Date('2026-07-27T04:00:00.000Z');
    const dueAt = new Date('2026-06-01T12:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      name: 'Backlog Idempotency Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.readyDemand,
      demandKey: 'test:backlog:concurrent',
      displayReference: 'BACKLOG-CONCURRENT',
      locationId: 'location-1',
      revisionHash: 'backlog-concurrent',
      revisionAt: dueAt,
      phase: 'post_production',
      sourceStatusCode: 'COMPLETED',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_price',
      dueAt,
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.readyOrder,
      orderDemandId: ids.readyDemand,
      locationId: 'location-1',
      dueAt,
      operationalStatus: 'ineligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
    });

    const idPort = makeIds();
    const repo = makeReviewProductionOrderBacklogRepository({
      db: testDb.db,
      ids: idPort,
    });
    const preview = makePreviewProductionOrderBacklog({
      repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const commit = makeCommitProductionOrderBacklog({
      repo,
      policy: allowPolicy,
      clock: { now: () => now },
      ids: idPort,
    });
    const scope = {
      locationId: 'location-1',
      filter: 'all_due_before_cutoff' as const,
      cutoff: '2026-07-01T00:00:00.000Z',
      reason: 'completed_outside_pressly' as const,
      cursor: null,
      maxOrders: 250,
    };
    const reviewed = await preview(scope);
    if (reviewed.tag === 'err') throw reviewed.error;
    const command = {
      ...scope,
      note: null,
      previewHash: reviewed.value.previewHash,
      idempotencyKey: 'backlog-concurrent-same-key-201',
      actorId: ids.actor,
    };

    const outcomes = await Promise.all([commit(command), commit(command)]);
    expect(
      outcomes
        .flatMap((outcome) =>
          outcome.tag === 'ok' ? [outcome.value.replayed] : [],
        )
        .sort(),
    ).toEqual([false, true]);
    const successful = outcomes.flatMap((outcome) =>
      outcome.tag === 'ok' ? [outcome.value] : [],
    );
    expect(successful).toHaveLength(2);
    expect(successful[0]?.bulkOperationId).toBe(successful[1]?.bulkOperationId);
    expect(successful[0]?.resolvedCount).toBe(1);
    expect(
      await testDb.db
        .select()
        .from(laundryProduction.workEvents)
        .where(
          eq(
            laundryProduction.workEvents.idempotencyKey,
            command.idempotencyKey,
          ),
        ),
    ).toHaveLength(1);
  });

  it('uses a stable keyset to advance after committing a bounded first page', async () => {
    const now = new Date('2026-07-27T04:00:00.000Z');
    const dueAt = new Date('2026-06-01T12:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      name: 'Backlog Pagination Facility',
      timezone: 'America/New_York',
    });
    const demandIds = [
      ids.pageDemand1,
      ids.pageDemand2,
      ids.pageDemand3,
    ] as const;
    const orderIds = [ids.pageOrder1, ids.pageOrder2, ids.pageOrder3] as const;
    await seedProductionDemands(
      testDb.db,
      demandIds.map((id, index) => ({
        id,
        demandKey: `test:backlog:page:${index + 1}`,
        displayReference: `BACKLOG-PAGE-${index + 1}`,
        locationId: 'location-1',
        revisionHash: `backlog-page-${index + 1}`,
        revisionAt: dueAt,
        phase: 'post_production' as const,
        sourceStatusCode: 'COMPLETED',
        estimatedWeightLbs: 20 + index,
        estimatedWeightSource: 'external_price' as const,
        dueAt,
      })),
    );
    await testDb.db.insert(laundryProduction.productionOrders).values(
      orderIds.map((id, index) => ({
        id,
        orderDemandId: demandIds[index] as string,
        locationId: 'location-1',
        dueAt,
        operationalStatus: 'ineligible',
        executionStatus: 'unassigned',
        derivedWeightLbs: 20 + index,
      })),
    );

    const idPort = makeIds();
    const repo = makeReviewProductionOrderBacklogRepository({
      db: testDb.db,
      ids: idPort,
    });
    const preview = makePreviewProductionOrderBacklog({
      repo,
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const commit = makeCommitProductionOrderBacklog({
      repo,
      policy: allowPolicy,
      clock: { now: () => now },
      ids: idPort,
    });
    const firstScope = {
      locationId: 'location-1',
      filter: 'all_due_before_cutoff' as const,
      cutoff: '2026-07-01T00:00:00.000Z',
      reason: 'completed_outside_pressly' as const,
      cursor: null,
      maxOrders: 2,
    };

    const first = await preview(firstScope);
    expect(first).toMatchObject({
      tag: 'ok',
      value: {
        candidateCount: 2,
        hasMore: true,
        groups: {
          readyToArchive: [
            { orderId: ids.pageOrder1 },
            { orderId: ids.pageOrder2 },
          ],
        },
      },
    });
    if (first.tag === 'err' || first.value.nextCursor === null)
      throw new Error('Expected a second backlog page.');

    const firstCommit = await commit({
      ...firstScope,
      note: null,
      previewHash: first.value.previewHash,
      idempotencyKey: 'backlog-postgres-page-1',
      actorId: ids.actor,
    });
    expect(firstCommit).toMatchObject({
      tag: 'ok',
      value: {
        resolvedCount: 2,
        nextCursor: first.value.nextCursor,
      },
    });
    if (firstCommit.tag === 'err') throw firstCommit.error;

    await expect(
      preview({
        ...firstScope,
        cursor: firstCommit.value.nextCursor,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        candidateCount: 1,
        hasMore: false,
        cursor: first.value.nextCursor,
        nextCursor: null,
        groups: {
          readyToArchive: [{ orderId: ids.pageOrder3 }],
        },
      },
    });
  });

  it('keeps immutable schedule and prior selection-command evidence out of bulk readiness', async () => {
    const now = new Date('2026-07-27T04:00:00.000Z');
    const dueAt = new Date('2026-06-01T12:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      name: 'Backlog Evidence Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, [
      {
        id: ids.evidenceDemand1,
        demandKey: 'test:backlog:evidence:snapshot',
        displayReference: 'BACKLOG-EVIDENCE-SNAPSHOT',
        locationId: 'location-1',
        revisionHash: 'backlog-evidence-snapshot',
        revisionAt: dueAt,
        phase: 'expected',
        sourceStatusCode: 'SUBMITTED',
        estimatedWeightLbs: 24,
        estimatedWeightSource: 'external_price',
        dueAt,
      },
      {
        id: ids.evidenceDemand2,
        demandKey: 'test:backlog:evidence:event',
        displayReference: 'BACKLOG-EVIDENCE-EVENT',
        locationId: 'location-1',
        revisionHash: 'backlog-evidence-event',
        revisionAt: dueAt,
        phase: 'expected',
        sourceStatusCode: 'SUBMITTED',
        estimatedWeightLbs: 18,
        estimatedWeightSource: 'external_price',
        dueAt,
      },
    ]);
    await testDb.db.insert(laundryProduction.productionOrders).values([
      {
        id: ids.evidenceOrder1,
        orderDemandId: ids.evidenceDemand1,
        locationId: 'location-1',
        dueAt,
        operationalStatus: 'release_pending',
        executionStatus: 'unassigned',
        derivedWeightLbs: 24,
      },
      {
        id: ids.evidenceOrder2,
        orderDemandId: ids.evidenceDemand2,
        locationId: 'location-1',
        dueAt,
        operationalStatus: 'release_pending',
        executionStatus: 'unassigned',
        derivedWeightLbs: 18,
      },
    ]);
    await testDb.db.insert(laundryProduction.productionShifts).values({
      id: ids.evidenceShift,
      locationId: 'location-1',
      startsAt: new Date('2026-07-27T21:00:00.000Z'),
      endsAt: new Date('2026-07-28T02:00:00.000Z'),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
    });
    await testDb.db.insert(laundryProduction.schedulerConfigs).values({
      id: ids.evidenceConfig,
      locationId: 'location-1',
      pulseMinutes: 45,
      foldLbsPerFolderMinute: 1,
      algorithmVersion: 'fixed-pulse-ffd-v1',
      version: 1,
      stageFitAssertion: {},
      assertedBy: ids.actor,
      publishedAt: now,
    });
    await testDb.db.insert(laundryProduction.scheduleRuns).values({
      id: ids.evidenceSchedule,
      locationId: 'location-1',
      productionShiftId: ids.evidenceShift,
      schedulerConfigId: ids.evidenceConfig,
      status: 'draft',
      inputSnapshot: {
        orders: [{ id: ids.evidenceOrder1 }],
      },
      inputSnapshotHash: 'evidence-input',
      outputPlan: {},
      outputPlanHash: 'evidence-output',
      algorithmVersion: 'fixed-pulse-ffd-v1',
      pulseCapacityLbs: 224,
      batchCount: 0,
      makespanMinutes: 0,
      plannedCompletionAt: new Date('2026-07-27T21:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.workEvents).values({
      id: ids.evidenceEvent,
      locationId: 'location-1',
      eventType: 'production_shift_selection_replaced',
      entityType: 'production_shift',
      entityId: ids.evidenceShift,
      actorId: ids.actor,
      expectedVersion: 0,
      idempotencyKey: 'backlog-evidence-selection-event',
      payload: {
        selectedOrderIds: [ids.evidenceOrder2],
        version: 1,
        supersededScheduleRunId: null,
      },
      createdAt: now,
    });

    const reviewed = await makePreviewProductionOrderBacklog({
      repo: makeReviewProductionOrderBacklogRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    })({
      locationId: 'location-1',
      filter: 'all_due_before_cutoff',
      cutoff: '2026-07-01T00:00:00.000Z',
      reason: 'processor_not_in_use',
      cursor: null,
      maxOrders: 250,
    });

    expect(reviewed).toMatchObject({
      tag: 'ok',
      value: {
        groups: {
          readyToArchive: [],
          keptForSafety: [
            {
              orderId: ids.evidenceOrder1,
              reasons: ['selected_for_shift'],
            },
            {
              orderId: ids.evidenceOrder2,
              reasons: ['selected_for_shift'],
            },
          ],
        },
      },
    });
  });
});
