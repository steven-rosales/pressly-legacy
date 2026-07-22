import { asc, eq, laundryProduction } from '@pressly/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresProductionApplication } from '../../src/main.ts';
import {
  createProductionTestDatabase,
  seedCanonicalFulfillment,
} from '../support/database.ts';
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
  it('creates exact bag rows both on order creation and later source adoption', async () => {
    const ids = makeIds();
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: baseCommand.locationId,
      name: 'Synthetic Facility',
      timezone: 'America/New_York',
    });
    const application = makePostgresProductionApplication({
      db: testDb.db,
      policy: allowPolicy,
      scheduler: simpleScheduler,
      clock: makeClock('2026-07-14T14:01:00.000Z').clock,
      ids,
    });

    const createdFulfillmentId = '00000000-0000-4000-8000-000000001001';
    await seedCanonicalFulfillment(testDb.db, {
      orderId: '00000000-0000-4000-8000-000000002001',
      fulfillmentId: createdFulfillmentId,
      locationId: baseCommand.locationId,
      displayNumber: 'CENTS-1001',
      dueAt: baseCommand.dueAt,
    });
    const created = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: createdFulfillmentId,
      fulfillmentVersion: 1,
      bagCount: 2,
      idempotencyKey: 'demand-create-with-bags',
    });
    expect(created).toEqual(
      expect.objectContaining({
        tag: 'ok',
        value: expect.objectContaining({ outcome: 'applied' }),
      }),
    );
    if (created.tag === 'err' || created.value.productionOrderId === null)
      return;

    await expect(
      testDb.db
        .select({ bagIndex: laundryProduction.bags.bagIndex })
        .from(laundryProduction.bags)
        .where(
          eq(
            laundryProduction.bags.productionOrderId,
            created.value.productionOrderId,
          ),
        )
        .orderBy(asc(laundryProduction.bags.bagIndex)),
    ).resolves.toEqual([{ bagIndex: 0 }, { bagIndex: 1 }]);

    const adoptedFulfillmentId = '00000000-0000-4000-8000-000000001002';
    await seedCanonicalFulfillment(testDb.db, {
      orderId: '00000000-0000-4000-8000-000000002002',
      fulfillmentId: adoptedFulfillmentId,
      locationId: baseCommand.locationId,
      displayNumber: 'CENTS-1002',
      dueAt: baseCommand.dueAt,
    });
    const pending = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: adoptedFulfillmentId,
      fulfillmentVersion: 1,
      displayReference: 'CENTS-1002',
      bagCount: null,
      idempotencyKey: 'demand-create-pending',
    });
    expect(pending).toMatchObject({ tag: 'ok', value: { outcome: 'applied' } });
    if (pending.tag === 'err' || pending.value.productionOrderId === null)
      return;

    const adopted = await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: adoptedFulfillmentId,
      fulfillmentVersion: 2,
      displayReference: 'CENTS-1002',
      observedAt: '2026-07-14T14:05:00.000Z',
      projectionHash: 'b'.repeat(64),
      bagCount: 3,
      idempotencyKey: 'demand-adopt-bags',
    });
    expect(adopted).toMatchObject({ tag: 'ok', value: { outcome: 'applied' } });

    await expect(
      testDb.db
        .select({ bagIndex: laundryProduction.bags.bagIndex })
        .from(laundryProduction.bags)
        .where(
          eq(
            laundryProduction.bags.productionOrderId,
            pending.value.productionOrderId,
          ),
        )
        .orderBy(asc(laundryProduction.bags.bagIndex)),
    ).resolves.toEqual([{ bagIndex: 0 }, { bagIndex: 1 }, { bagIndex: 2 }]);
  });

  it('keeps pre-release forecasts off the floor while showing released or physically admitted work', async () => {
    await testDb.db.insert(laundryProduction.productionLocations).values({
      id: baseCommand.locationId,
      name: 'Synthetic Facility',
      timezone: 'America/New_York',
    });
    const application = makePostgresProductionApplication({
      db: testDb.db,
      policy: allowPolicy,
      scheduler: simpleScheduler,
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
    await application.applyFulfillmentDemand({
      ...baseCommand,
      fulfillmentId: admittedId,
      fulfillmentVersion: 1,
      displayReference: 'CENTS-ADMITTED',
      admissionState: 'unreleased',
      bagCount: 2,
      idempotencyKey: 'expected-with-intake',
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
