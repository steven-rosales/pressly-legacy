import { asc, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresProductionApplication } from '../../../../src/composition/production.composition.ts';
import {
  createProductionTestDatabase,
  seedCanonicalFulfillment,
} from '../../../support/database.ts';
import { makeClock, makeIds } from '../../../support/production.fake.ts';

const testDb = createProductionTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const baseCommand = {
  displayReference: 'CENTS-1001',
  locationId: 'location-1',
  observedAt: '2026-07-14T14:00:00.000Z',
  projectionHash: 'a'.repeat(64),
  admissionState: 'released' as const,
  commercialState: 'open' as const,
  dueAt: '2026-07-14T20:00:00.000Z',
  estimatedWeightLbs: 42,
  estimatedWeightSource: 'external_estimate' as const,
};

describe('canonical fulfillment demand materialization', () => {
  it('ignores non-null external bag counts on creation and later revisions', async () => {
    const ids = makeIds();
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: baseCommand.locationId,
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Synthetic Facility',
      timezone: 'America/New_York',
    });
    const application = makePostgresProductionApplication({
      db: testDb.db,
      clock: makeClock('2026-07-14T14:01:00.000Z').clock,
      ids,
    });

    const fulfillmentId = '00000000-0000-4000-8000-000000001001';
    await seedCanonicalFulfillment(testDb.db, {
      orderId: '00000000-0000-4000-8000-000000002001',
      fulfillmentId,
      locationId: baseCommand.locationId,
      displayNumber: 'CENTS-1001',
      dueAt: baseCommand.dueAt,
    });
    const created = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId,
      fulfillmentVersion: 1,
      bagCount: 2,
      idempotencyKey: 'demand-create-with-legacy-bags',
    });
    expect(created).toEqual(
      expect.objectContaining({
        tag: 'ok',
        value: expect.objectContaining({ outcome: 'applied' }),
      }),
    );
    if (created.tag === 'err' || created.value.productionOrderId === null)
      return;

    const physicalState = () =>
      testDb.db
        .select({
          bagCount: laundryProduction.productionOrders.bagCount,
          bagCountSource: laundryProduction.productionOrders.bagCountSource,
          intakeRecordedAt: laundryProduction.productionOrders.intakeRecordedAt,
          intakeVersion: laundryProduction.productionOrders.intakeVersion,
          operationalStatus:
            laundryProduction.productionOrders.operationalStatus,
        })
        .from(laundryProduction.productionOrders)
        .where(
          eq(
            laundryProduction.productionOrders.id,
            created.value.productionOrderId!,
          ),
        );
    await expect(physicalState()).resolves.toEqual([
      {
        bagCount: null,
        bagCountSource: null,
        intakeRecordedAt: null,
        intakeVersion: 0,
        operationalStatus: 'intake_pending',
      },
    ]);
    await expect(
      testDb.db
        .select({ bagIndex: laundryProduction.bags.bagIndex })
        .from(laundryProduction.bags)
        .where(
          eq(
            laundryProduction.bags.productionOrderId,
            created.value.productionOrderId,
          ),
        ),
    ).resolves.toEqual([]);

    const revised = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId,
      fulfillmentVersion: 2,
      observedAt: '2026-07-14T14:05:00.000Z',
      projectionHash: 'b'.repeat(64),
      bagCount: 9,
      idempotencyKey: 'demand-revise-with-legacy-bags',
    });
    expect(revised).toMatchObject({ tag: 'ok', value: { outcome: 'applied' } });

    await expect(physicalState()).resolves.toEqual([
      {
        bagCount: null,
        bagCountSource: null,
        intakeRecordedAt: null,
        intakeVersion: 0,
        operationalStatus: 'intake_pending',
      },
    ]);
    await expect(
      testDb.db
        .select({ bagIndex: laundryProduction.bags.bagIndex })
        .from(laundryProduction.bags)
        .where(
          eq(
            laundryProduction.bags.productionOrderId,
            created.value.productionOrderId,
          ),
        ),
    ).resolves.toEqual([]);
  });

  it('preserves operator intake across a conflicting external bag count', async () => {
    const ids = makeIds();
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: baseCommand.locationId,
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Synthetic Facility',
      timezone: 'America/New_York',
    });
    const application = makePostgresProductionApplication({
      db: testDb.db,
      clock: makeClock('2026-07-14T14:01:00.000Z').clock,
      ids,
    });

    const fulfillmentId = '00000000-0000-4000-8000-000000001002';
    await seedCanonicalFulfillment(testDb.db, {
      orderId: '00000000-0000-4000-8000-000000002002',
      fulfillmentId,
      locationId: baseCommand.locationId,
      displayNumber: 'CENTS-1002',
      dueAt: baseCommand.dueAt,
    });
    const projected = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId,
      fulfillmentVersion: 1,
      displayReference: 'CENTS-1002',
      bagCount: 7,
      idempotencyKey: 'demand-before-operator-intake',
    });
    if (projected.tag === 'err' || projected.value.productionOrderId === null)
      throw new Error('Expected Production work.');

    const intake = await application.recordOrderIntake({
      locationId: baseCommand.locationId,
      orderId: projected.value.productionOrderId,
      bagCount: 2,
      expectedVersion: 1,
      actorId: '00000000-0000-4000-8000-000000009001',
      idempotencyKey: 'operator-intake-before-demand-revision',
    });
    if (intake.tag === 'err') throw intake.error;

    const selectPhysicalState = () =>
      testDb.db
        .select({
          bagCount: laundryProduction.productionOrders.bagCount,
          bagCountSource: laundryProduction.productionOrders.bagCountSource,
          intakeRecordedAt: laundryProduction.productionOrders.intakeRecordedAt,
          intakeVersion: laundryProduction.productionOrders.intakeVersion,
        })
        .from(laundryProduction.productionOrders)
        .where(
          eq(
            laundryProduction.productionOrders.id,
            projected.value.productionOrderId!,
          ),
        );
    const before = await selectPhysicalState();
    expect(before).toEqual([
      {
        bagCount: 2,
        bagCountSource: 'operator_intake',
        intakeRecordedAt: new Date('2026-07-14T14:01:00.000Z'),
        intakeVersion: 1,
      },
    ]);

    await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId,
      fulfillmentVersion: 2,
      displayReference: 'CENTS-1002',
      observedAt: '2026-07-14T14:05:00.000Z',
      projectionHash: 'b'.repeat(64),
      bagCount: 9,
      idempotencyKey: 'demand-after-operator-intake',
    });

    await expect(selectPhysicalState()).resolves.toEqual(before);
    await expect(
      testDb.db
        .select({ bagIndex: laundryProduction.bags.bagIndex })
        .from(laundryProduction.bags)
        .where(
          eq(
            laundryProduction.bags.productionOrderId,
            projected.value.productionOrderId,
          ),
        )
        .orderBy(asc(laundryProduction.bags.bagIndex)),
    ).resolves.toEqual([{ bagIndex: 0 }, { bagIndex: 1 }]);
  });

  it('keeps pre-release forecasts off the floor while showing released or physically admitted work', async () => {
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: baseCommand.locationId,
      businessId: '00000000-0000-4000-8000-000000000100',
      name: 'Synthetic Facility',
      timezone: 'America/New_York',
    });
    const application = makePostgresProductionApplication({
      db: testDb.db,
      clock: makeClock('2026-07-14T14:01:00.000Z').clock,
      ids: makeIds(),
    });

    const expectedId = '00000000-0000-4000-8000-000000001003';
    const releasedId = '00000000-0000-4000-8000-000000001004';
    const admittedId = '00000000-0000-4000-8000-000000001005';
    for (const [orderId, fulfillmentId, displayNumber] of [
      ['00000000-0000-4000-8000-000000002003', expectedId, 'CENTS-EXPECTED'],
      ['00000000-0000-4000-8000-000000002004', releasedId, 'CENTS-RELEASED'],
      ['00000000-0000-4000-8000-000000002005', admittedId, 'CENTS-ADMITTED'],
    ] as const)
      await seedCanonicalFulfillment(testDb.db, {
        orderId,
        fulfillmentId,
        locationId: baseCommand.locationId,
        displayNumber,
        dueAt: baseCommand.dueAt,
      });

    await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: expectedId,
      fulfillmentVersion: 1,
      displayReference: 'CENTS-EXPECTED',
      admissionState: 'unreleased',
      bagCount: null,
      idempotencyKey: 'expected-without-intake',
    });
    await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: releasedId,
      fulfillmentVersion: 1,
      displayReference: 'CENTS-RELEASED',
      bagCount: null,
      idempotencyKey: 'released-without-intake',
    });
    const admitted = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: admittedId,
      fulfillmentVersion: 1,
      displayReference: 'CENTS-ADMITTED',
      admissionState: 'unreleased',
      bagCount: 2,
      idempotencyKey: 'expected-with-intake',
    });
    if (admitted.tag === 'err' || admitted.value.productionOrderId === null)
      throw new Error('Expected Production work.');
    await application.recordOrderIntake({
      locationId: baseCommand.locationId,
      orderId: admitted.value.productionOrderId,
      bagCount: 2,
      expectedVersion: 1,
      actorId: '00000000-0000-4000-8000-000000009001',
      idempotencyKey: 'physical-intake-for-control-list',
    });

    const result = await application.listProductionOrderControl({
      locationId: baseCommand.locationId,
      view: 'all',
      limit: 25,
    });

    expect(result).toMatchObject({
      tag: 'ok',
      value: { counts: { all: 3 } },
    });
    if (result.tag === 'err') return;
    expect(
      result.value.items.map((item) => item.order.externalOrderId).sort(),
    ).toEqual(['CENTS-ADMITTED', 'CENTS-EXPECTED', 'CENTS-RELEASED']);
    expect(
      result.value.items.find(
        (item) => item.order.externalOrderId === 'CENTS-RELEASED',
      )?.attention,
    ).toMatchObject({
      reason: 'intake_required',
      message:
        'The source released this order to production, but physical bag intake has not been recorded.',
    });
  });
});
