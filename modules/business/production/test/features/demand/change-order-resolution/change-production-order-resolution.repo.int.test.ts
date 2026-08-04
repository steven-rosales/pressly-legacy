import { eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeChangeProductionOrderResolutionRepository } from '../../../../src/features/demand/change-order-resolution/change-production-order-resolution.repo.ts';
import { makeChangeProductionOrderResolution } from '../../../../src/features/demand/change-order-resolution/change-production-order-resolution.usecase.ts';
import { makeReplaceShiftOrderSelectionRepository } from '../../../../src/features/scheduling/replace-shift-selection/replace-shift-order-selection.repo.ts';
import { makeReplaceShiftOrderSelection } from '../../../../src/features/scheduling/replace-shift-selection/replace-shift-order-selection.usecase.ts';
import {
  createProductionTestDatabase,
  seedProductionDemands,
} from '../../../support/database.ts';
import { allowPolicy, makeIds } from '../../../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const ids = {
  demand: '10000000-0000-4000-8000-000000000101',
  order: '20000000-0000-4000-8000-000000000101',
  actor: '40000000-0000-4000-8000-000000000101',
  historicalDemand: '10000000-0000-4000-8000-000000000102',
  historicalOrder: '20000000-0000-4000-8000-000000000102',
  historicalShift: '30000000-0000-4000-8000-000000000102',
} as const;

describe('production order resolution Postgres workflow', () => {
  it('persists a graph-governed resolve and restore with coherent audit metadata', async () => {
    const now = new Date('2026-07-26T23:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Resolution Test Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.demand,
      demandKey: 'test:resolution',
      displayReference: 'RESOLUTION-101',
      locationId: 'location-1',
      revisionHash: 'resolution',
      revisionAt: now,
      phase: 'expected',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_price',
      dueAt: new Date('2026-07-27T20:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-27T20:00:00.000Z'),
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
    });

    const change = makeChangeProductionOrderResolution({
      repo: makeChangeProductionOrderResolutionRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    });

    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        action: 'resolve_without_production',
        reason: 'processor_not_in_use',
        note: 'The location is restarting Processor operations.',
        confirmReviewedFacts: false,
        expectedVersion: 1,
        idempotencyKey: 'resolve-postgres-101',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: {
        resolutionState: 'resolved_without_production',
        version: 2,
      },
    });
    const [resolved] = await testDb.db
      .select({
        resolutionState: laundryProduction.productionOrders.resolutionState,
        resolvedAt: laundryProduction.productionOrders.resolvedAt,
        resolvedBy: laundryProduction.productionOrders.resolvedBy,
        reason: laundryProduction.productionOrders.resolutionReason,
        note: laundryProduction.productionOrders.resolutionNote,
        executionStatus: laundryProduction.productionOrders.executionStatus,
        version: laundryProduction.productionOrders.version,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.order));
    expect(resolved).toEqual({
      resolutionState: 'resolved_without_production',
      resolvedAt: now,
      resolvedBy: ids.actor,
      reason: 'processor_not_in_use',
      note: 'The location is restarting Processor operations.',
      executionStatus: 'unassigned',
      version: 2,
    });

    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        action: 'restore',
        reason: 'manager_correction',
        note: null,
        expectedVersion: 2,
        idempotencyKey: 'restore-postgres-101',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { resolutionState: 'open', version: 3 },
    });
    const [restored] = await testDb.db
      .select({
        resolutionState: laundryProduction.productionOrders.resolutionState,
        resolvedAt: laundryProduction.productionOrders.resolvedAt,
        resolvedBy: laundryProduction.productionOrders.resolvedBy,
        reason: laundryProduction.productionOrders.resolutionReason,
        note: laundryProduction.productionOrders.resolutionNote,
        status: laundryProduction.productionOrders.operationalStatus,
        version: laundryProduction.productionOrders.version,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.order));
    expect(restored).toEqual({
      resolutionState: 'open',
      resolvedAt: null,
      resolvedBy: null,
      reason: null,
      note: null,
      status: 'release_pending',
      version: 3,
    });

    const events = await testDb.db
      .select({ type: laundryProduction.workEvents.eventType })
      .from(laundryProduction.workEvents)
      .where(eq(laundryProduction.workEvents.entityId, ids.order));
    expect(events).toEqual([
      { type: 'production_order_resolved_without_production' },
      { type: 'production_order_restored' },
    ]);
  });

  it('atomically restores the current source demand instead of the archived projection', async () => {
    const resolvedAt = new Date('2026-07-26T23:00:00.000Z');
    const refreshedAt = new Date('2026-07-27T01:00:00.000Z');
    const originalDueAt = new Date('2026-07-27T20:00:00.000Z');
    const currentDueAt = new Date('2026-08-02T18:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Current Source Restore Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.demand,
      demandKey: 'test:resolution:current-source',
      displayReference: 'RESOLUTION-SOURCE-101',
      locationId: 'location-1',
      revisionHash: 'resolution-current-source-v1',
      revisionAt: resolvedAt,
      phase: 'expected',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_estimate',
      dueAt: originalDueAt,
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: 'location-1',
      dueAt: originalDueAt,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
      derivedWeightSource: 'external_estimate',
    });

    let now = resolvedAt;
    const change = makeChangeProductionOrderResolution({
      repo: makeChangeProductionOrderResolutionRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    });
    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        action: 'resolve_without_production',
        reason: 'processor_not_in_use',
        note: null,
        confirmReviewedFacts: false,
        expectedVersion: 1,
        idempotencyKey: 'resolve-current-source-101',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({ tag: 'ok' });

    await testDb.db
      .update(laundryProduction.orderDemands)
      .set({
        fulfillmentVersion: 2,
        projectionHash: 'a'.repeat(64),
        revisionHash: 'a'.repeat(64),
        revisionAt: refreshedAt,
        admissionState: 'released',
        commercialState: 'open',
        phase: 'production_released',
        estimatedWeightLbs: 48,
        estimatedWeightSource: 'external_estimate',
        dueAt: currentDueAt,
        updatedAt: refreshedAt,
      })
      .where(eq(laundryProduction.orderDemands.id, ids.demand));

    const [archivedProjection] = await testDb.db
      .select({
        dueAt: laundryProduction.productionOrders.dueAt,
        weight: laundryProduction.productionOrders.derivedWeightLbs,
        status: laundryProduction.productionOrders.operationalStatus,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.order));
    expect(archivedProjection).toEqual({
      dueAt: originalDueAt,
      weight: 24,
      status: 'release_pending',
    });

    now = refreshedAt;
    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.order,
        action: 'restore',
        reason: 'work_should_be_produced',
        note: null,
        expectedVersion: 2,
        idempotencyKey: 'restore-current-source-101',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'ok',
      value: { resolutionState: 'open', version: 3 },
    });

    const [restored] = await testDb.db
      .select({
        dueAt: laundryProduction.productionOrders.dueAt,
        weight: laundryProduction.productionOrders.derivedWeightLbs,
        weightSource: laundryProduction.productionOrders.derivedWeightSource,
        status: laundryProduction.productionOrders.operationalStatus,
        resolutionState: laundryProduction.productionOrders.resolutionState,
        version: laundryProduction.productionOrders.version,
      })
      .from(laundryProduction.productionOrders)
      .where(eq(laundryProduction.productionOrders.id, ids.order));
    expect(restored).toEqual({
      dueAt: currentDueAt,
      weight: 48,
      weightSource: 'external_estimate',
      status: 'intake_pending',
      resolutionState: 'open',
      version: 3,
    });
  });

  it('replays concurrent identical resolution commands after the location lock', async () => {
    const now = new Date('2026-07-26T23:00:00.000Z');
    const dueAt = new Date('2026-07-27T20:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Resolution Idempotency Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.demand,
      demandKey: 'test:resolution:concurrent',
      displayReference: 'RESOLUTION-CONCURRENT-101',
      locationId: 'location-1',
      revisionHash: 'resolution-concurrent',
      revisionAt: now,
      phase: 'expected',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_estimate',
      dueAt,
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.order,
      orderDemandId: ids.demand,
      locationId: 'location-1',
      dueAt,
      operationalStatus: 'release_pending',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
    });

    const change = makeChangeProductionOrderResolution({
      repo: makeChangeProductionOrderResolutionRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    });
    const command = {
      locationId: 'location-1',
      orderId: ids.order,
      action: 'resolve_without_production' as const,
      reason: 'processor_not_in_use' as const,
      note: null,
      confirmReviewedFacts: false,
      expectedVersion: 1,
      idempotencyKey: 'resolve-concurrent-same-key-101',
      actorId: ids.actor,
    };

    const outcomes = await Promise.all([change(command), change(command)]);
    expect(
      outcomes
        .flatMap((outcome) =>
          outcome.tag === 'ok' ? [outcome.value.replayed] : [],
        )
        .sort(),
    ).toEqual([false, true]);
    expect(outcomes).toEqual([
      expect.objectContaining({
        tag: 'ok',
        value: expect.objectContaining({ version: 2 }),
      }),
      expect.objectContaining({
        tag: 'ok',
        value: expect.objectContaining({ version: 2 }),
      }),
    ]);
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

  it('blocks resolution after an order was selected and then deselected before Compute', async () => {
    const now = new Date('2026-07-26T23:00:00.000Z');
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: 'location-1',
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Selection Evidence Facility',
      timezone: 'America/New_York',
    });
    await seedProductionDemands(testDb.db, {
      id: ids.historicalDemand,
      demandKey: 'test:resolution:historical-selection',
      displayReference: 'RESOLUTION-102',
      locationId: 'location-1',
      revisionHash: 'resolution-historical-selection',
      revisionAt: now,
      phase: 'production_released',
      estimatedWeightLbs: 24,
      estimatedWeightSource: 'external_price',
      dueAt: new Date('2026-07-27T20:00:00.000Z'),
    });
    await testDb.db.insert(laundryProduction.productionOrders).values({
      id: ids.historicalOrder,
      orderDemandId: ids.historicalDemand,
      locationId: 'location-1',
      dueAt: new Date('2026-07-27T20:00:00.000Z'),
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      derivedWeightLbs: 24,
      bagCount: 1,
      bagCountSource: 'physical_intake',
      intakeRecordedAt: now,
      intakeVersion: 1,
    });
    await testDb.db.insert(laundryProduction.productionShifts).values({
      id: ids.historicalShift,
      locationId: 'location-1',
      startsAt: new Date('2026-07-27T21:00:00.000Z'),
      endsAt: new Date('2026-07-28T02:00:00.000Z'),
      timezone: 'America/New_York',
      effectiveFolderCount: 2,
    });

    const selection = makeReplaceShiftOrderSelection({
      repo: makeReplaceShiftOrderSelectionRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    });
    await expect(
      selection({
        locationId: 'location-1',
        productionShiftId: ids.historicalShift,
        selectedOrderIds: [ids.historicalOrder],
        expectedVersion: 0,
        idempotencyKey: 'selection-evidence-select-102',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({ tag: 'ok' });
    await expect(
      selection({
        locationId: 'location-1',
        productionShiftId: ids.historicalShift,
        selectedOrderIds: [],
        expectedVersion: 1,
        idempotencyKey: 'selection-evidence-deselect-102',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({ tag: 'ok' });

    const currentSelection = await testDb.db
      .select()
      .from(laundryProduction.productionShiftSelectedOrders)
      .where(
        eq(
          laundryProduction.productionShiftSelectedOrders.productionOrderId,
          ids.historicalOrder,
        ),
      );
    expect(currentSelection).toEqual([]);

    const change = makeChangeProductionOrderResolution({
      repo: makeChangeProductionOrderResolutionRepository({
        db: testDb.db,
        ids: makeIds(),
      }),
      policy: allowPolicy,
      clock: { now: () => now },
    });
    await expect(
      change({
        locationId: 'location-1',
        orderId: ids.historicalOrder,
        action: 'resolve_without_production',
        reason: 'processor_not_in_use',
        note: null,
        confirmReviewedFacts: true,
        expectedVersion: 1,
        idempotencyKey: 'resolve-historical-selection-102',
        actorId: ids.actor,
      }),
    ).resolves.toMatchObject({
      tag: 'err',
      error: { code: 'production_order_resolution_blocked' },
    });
  });
});
