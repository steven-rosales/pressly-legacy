import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeEffectivePricingCatalogFinder } from '../../src/adapters/load-pricing-catalog/persistence/effective-pricing-catalog.repo.ts';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { createPricingTestDatabase } from '../support/database.ts';
import {
  insertPricingService,
  insertPricingSetWithItems,
} from '../support/pricing-fixtures.ts';

const testDb = createPricingTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

describe('effective pricing catalog repo', () => {
  it('loads the current global catalog ordered by sort order', async () => {
    const service = await insertPricingService(testDb.db);

    await insertPricingSetWithItems(testDb.db, {
      serviceId: service.id,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      items: [
        {
          code: 'hang_dry',
          service: 'wash_fold',
          category: 'Other Services',
          name: 'Hang Dry',
          unit: 'item',
          priceCents: 295,
          sortOrder: 40,
          metadata: {},
        },
        {
          code: 'delivery_fee',
          service: 'wash_fold',
          category: 'Fee',
          name: 'Delivery Fee',
          unit: 'order',
          priceCents: 495,
          sortOrder: 30,
          metadata: { displayUnitLabel: '/ order' },
        },
      ],
    });

    const finder = makeEffectivePricingCatalogFinder(testDb.db);

    const actual = await finder.findEffectivePricingCatalog({
      serviceSlug: 'wash-fold',
    });

    const value = expectOk(actual);

    expect(value).toMatchObject({
      serviceSlug: 'wash-fold',
      currency: 'USD',
      items: [
        {
          service: 'wash_fold',
          category: 'Fee',
          name: 'Delivery Fee',
          unit: 'order',
          priceCents: 495,
          sortOrder: 30,
          metadata: { displayUnitLabel: '/ order' },
        },
        {
          service: 'wash_fold',
          category: 'Other Services',
          name: 'Hang Dry',
          unit: 'item',
          priceCents: 295,
          sortOrder: 40,
          metadata: {},
        },
      ],
    });
    expect(new Date(value.updatedAt).toString()).not.toBe('Invalid Date');
  });

  it('does not read inactive, expired, or future pricing sets as current', async () => {
    const service = await insertPricingService(testDb.db);
    await insertPricingSetWithItems(testDb.db, {
      serviceId: service.id,
      status: 'archived',
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
    });
    const finder = makeEffectivePricingCatalogFinder(testDb.db);

    const inactiveResult = await finder.findEffectivePricingCatalog({
      serviceSlug: 'wash-fold',
    });

    expectErrCode(inactiveResult, 'pricing_not_found');

    await testDb.reset();
    const serviceWithExpiredSet = await insertPricingService(testDb.db);
    await insertPricingSetWithItems(testDb.db, {
      serviceId: serviceWithExpiredSet.id,
      effectiveFrom: new Date('2000-01-01T00:00:00.000Z'),
      effectiveTo: new Date('2001-01-01T00:00:00.000Z'),
    });

    const expiredResult = await finder.findEffectivePricingCatalog({
      serviceSlug: 'wash-fold',
    });

    expectErrCode(expiredResult, 'pricing_not_found');

    await testDb.reset();
    const serviceWithFutureSet = await insertPricingService(testDb.db);
    await insertPricingSetWithItems(testDb.db, {
      serviceId: serviceWithFutureSet.id,
      effectiveFrom: new Date('2999-01-01T00:00:00.000Z'),
    });

    const futureResult = await finder.findEffectivePricingCatalog({
      serviceSlug: 'wash-fold',
    });

    expectErrCode(futureResult, 'pricing_not_found');
  });
});
