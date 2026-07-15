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
  state: 'ready_for_production' as const,
  dueAt: '2026-07-14T20:00:00.000Z',
  estimatedWeightLbs: 42,
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
});
