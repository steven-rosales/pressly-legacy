import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from '@pressly/db/query';
import * as pricing from '@pressly/db/schema/pricing';
import { makePostgresPricingChangeStore } from '../../src/foundations/adapters/postgres/pricing-change-store/pricing-change-store.repo.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makePricingChangeAuthor } from '../support/pricing-change.builder.ts';
import { createPricingTestDatabase } from '../support/database.ts';
import {
  insertPricingService,
  insertPricingSetWithItems,
} from '../support/pricing-fixtures.ts';

const testDb = createPricingTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('pricing change repo', () => {
  it('loads current pricing for publishing', async () => {
    const service = await insertPricingService(testDb.db);
    const { set } = await insertPricingSetWithItems(testDb.db, {
      serviceId: service.id,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      items: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          priceCents: 495,
          sortOrder: 30,
        },
        {
          code: 'hang_dry',
          name: 'Hang Dry',
          priceCents: 295,
          sortOrder: 40,
        },
      ],
    });
    const store = makePostgresPricingChangeStore({ db: testDb.db });

    const actual = await store.loadCurrentPricing({
      serviceSlug: 'wash-fold',
    });

    expectOk(actual);
    expect(actual).toEqual({
      tag: 'ok',
      value: {
        currentSet: {
          id: set.id,
          currency: 'USD',
        },
        currentItems: [
          {
            code: 'delivery_fee',
            name: 'Delivery Fee',
            priceCents: 495,
          },
          {
            code: 'hang_dry',
            name: 'Hang Dry',
            priceCents: 295,
          },
        ],
      },
    });
  });

  it('publishes a new pricing set, archives the old set, and writes an audit event', async () => {
    const service = await insertPricingService(testDb.db);
    const { set } = await insertPricingSetWithItems(testDb.db, {
      serviceId: service.id,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      items: [
        {
          code: 'delivery_fee',
          name: 'Delivery Fee',
          priceCents: 495,
          sortOrder: 30,
        },
        {
          code: 'hang_dry',
          name: 'Hang Dry',
          priceCents: 295,
          sortOrder: 40,
        },
      ],
    });
    const store = makePostgresPricingChangeStore({ db: testDb.db });
    const publishedAt = new Date('2026-05-21T12:00:00.000Z');

    const actual = await store.commitPricingChange({
      publishedAt,
      command: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        requestedBy: makePricingChangeAuthor(),
        items: [{ code: 'delivery_fee', priceCents: 100 }],
      },
      plan: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        oldPricingSetId: set.id,
        currency: 'USD',
        changes: [
          {
            code: 'delivery_fee',
            name: 'Delivery Fee',
            oldPriceCents: 495,
            newPriceCents: 100,
          },
        ],
      },
    });

    const value = expectOk(actual);

    expect(value.oldPricingSetId).toBe(set.id);
    expect(value.changeItemCount).toBe(1);
    expect(value.newPricingSetId).not.toBe(set.id);
    expect(value.auditEventId).toEqual(expect.any(String));

    const [oldSet] = await testDb.db
      .select()
      .from(pricing.pricingSets)
      .where(eq(pricing.pricingSets.id, set.id));
    const [newSet] = await testDb.db
      .select()
      .from(pricing.pricingSets)
      .where(eq(pricing.pricingSets.id, value.newPricingSetId));
    const newItems = await testDb.db
      .select()
      .from(pricing.pricingItems)
      .where(eq(pricing.pricingItems.pricingSetId, value.newPricingSetId))
      .orderBy(pricing.pricingItems.sortOrder);
    const [auditEvent] = await testDb.db
      .select()
      .from(pricing.pricingChangeEvents)
      .where(eq(pricing.pricingChangeEvents.id, value.auditEventId));

    expect(oldSet).toMatchObject({
      id: set.id,
      status: 'archived',
      effectiveTo: publishedAt,
    });
    expect(newSet).toMatchObject({
      id: value.newPricingSetId,
      status: 'active',
      currency: 'USD',
      effectiveFrom: publishedAt,
    });
    expect(newItems).toMatchObject([
      {
        code: 'delivery_fee',
        priceCents: 100,
      },
      {
        code: 'hang_dry',
        priceCents: 295,
      },
    ]);
    expect(auditEvent).toMatchObject({
      id: value.auditEventId,
      kind: 'pricing.publish',
      actorId: 'user_1',
      actorKind: 'human',
      actorDisplayName: 'steven',
      serviceSlug: 'wash-fold',
      reason: 'Update delivery fee',
      oldPricingSetId: set.id,
      newPricingSetId: value.newPricingSetId,
    });
  });

  it('returns typed not-found failures for missing publishing scope data', async () => {
    const service = await insertPricingService(testDb.db);
    await insertPricingSetWithItems(testDb.db, {
      serviceId: service.id,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
    });
    const store = makePostgresPricingChangeStore({ db: testDb.db });

    const missingService = await store.loadCurrentPricing({
      serviceSlug: 'dry-cleaning',
    });

    expectErrCode(missingService, 'pricing_service_not_found');
  });

  it('rejects stale publish plans when pricing changed after planning', async () => {
    const service = await insertPricingService(testDb.db);
    await insertPricingSetWithItems(testDb.db, {
      serviceId: service.id,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      items: [{ code: 'delivery_fee', priceCents: 495 }],
    });
    const store = makePostgresPricingChangeStore({ db: testDb.db });

    const actual = await store.commitPricingChange({
      publishedAt: new Date('2026-05-21T12:00:00.000Z'),
      command: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        requestedBy: makePricingChangeAuthor(),
        items: [{ code: 'delivery_fee', priceCents: 100 }],
      },
      plan: {
        serviceSlug: 'wash-fold',
        reason: 'Update delivery fee',
        oldPricingSetId: '00000000-0000-0000-0000-000000000000',
        currency: 'USD',
        changes: [
          {
            code: 'delivery_fee',
            name: 'Delivery Fee',
            oldPriceCents: 495,
            newPriceCents: 100,
          },
        ],
      },
    });

    expectErrCode(actual, 'pricing_state_changed');
  });
});
