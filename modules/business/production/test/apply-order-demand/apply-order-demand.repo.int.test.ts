import { asc, eq, laundryProduction } from '@pressly/db';
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

const baseCommand = {
  displayReference: 'CENTS-1001',
  locationId: 'location-1',
  revisionAt: '2026-07-14T14:00:00.000Z',
  revisionHash: 'a'.repeat(64),
  phase: 'production_released' as const,
  sourceStatusCode: 'IN_PROGRESS',
  dueAt: '2026-07-14T20:00:00.000Z',
  estimatedWeightLbs: 42,
  estimatedWeightSource: 'external_estimate' as const,
};

describe('source-supplied demand bag materialization', () => {
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

    const created = await application.applyOrderDemand({
      ...baseCommand,
      demandKey: 'cents:order:create-with-bags',
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

    const pending = await application.applyOrderDemand({
      ...baseCommand,
      demandKey: 'cents:order:adopt-bags',
      displayReference: 'CENTS-1002',
      bagCount: null,
      idempotencyKey: 'demand-create-pending',
    });
    expect(pending).toMatchObject({ tag: 'ok', value: { outcome: 'applied' } });
    if (pending.tag === 'err' || pending.value.productionOrderId === null)
      return;

    const adopted = await application.applyOrderDemand({
      ...baseCommand,
      demandKey: 'cents:order:adopt-bags',
      displayReference: 'CENTS-1002',
      revisionAt: '2026-07-14T14:05:00.000Z',
      revisionHash: 'b'.repeat(64),
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

    await application.applyOrderDemand({
      ...baseCommand,
      demandKey: 'cents:order:expected-without-intake',
      displayReference: 'CENTS-EXPECTED',
      phase: 'expected',
      sourceStatusCode: 'SUBMITTED',
      bagCount: null,
      idempotencyKey: 'expected-without-intake',
    });
    await application.applyOrderDemand({
      ...baseCommand,
      demandKey: 'cents:order:released-without-intake',
      displayReference: 'CENTS-RELEASED',
      bagCount: null,
      idempotencyKey: 'released-without-intake',
    });
    await application.applyOrderDemand({
      ...baseCommand,
      demandKey: 'cents:order:expected-with-intake',
      displayReference: 'CENTS-ADMITTED',
      phase: 'expected',
      sourceStatusCode: 'SUBMITTED',
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
