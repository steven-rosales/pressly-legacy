import {
  productionTestSchema,
  seedProductionLocationTestFacts,
} from '../../../testing/production-schema.spec-support.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeListOrdersPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['production_orders', 'order_demands', 'production_locations'],
  // The read model holds one snapshot connection while Access answers through
  // its independently owned capability connection.
  maxConnections: 2,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

const businessId = '00000000-0000-4000-8000-000000000100';
const asOf = new Date('2026-08-21T14:00:00.000Z');

const uuid = (suffix: number): string =>
  `10000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const seed = async (): Promise<void> => {
  await seedProductionLocationTestFacts(database.db, [
    {
      id: 'location-1',
      businessId,
      name: 'Orders Facility',
      timezone: 'America/New_York',
    },
    {
      id: 'location-inactive',
      businessId,
      name: 'Inactive Facility',
      timezone: 'America/Chicago',
      isActive: false,
    },
  ]);

  for (const index of [1, 2, 3] as const) {
    const dueAt = new Date(
      `2026-08-21T${String(14 + index).padStart(2, '0')}:00:00.000Z`,
    );
    await database.db.insert(productionTestSchema.orderDemands).values({
      id: uuid(20 + index),
      fulfillmentId: uuid(10 + index),
      fulfillmentVersion: 1,
      projectionHash: 'a'.repeat(64),
      admissionState: 'released',
      commercialState: 'open',
      displayReference: `ORDER-${String(index)}`,
      locationId: 'location-1',
      revisionAt: asOf,
      phase: 'production_released',
      estimatedWeightLbs: 20 + index,
      estimatedWeightSource: 'test_estimate',
      dueAt,
    });
    await database.db.insert(productionTestSchema.productionOrders).values({
      id: uuid(30 + index),
      orderDemandId: uuid(20 + index),
      locationId: 'location-1',
      dueAt,
      priority: index === 2,
      operationalStatus: 'eligible',
      executionStatus: 'unassigned',
      resolutionState: index === 3 ? 'resolved_without_production' : 'open',
      ...(index === 3
        ? {
            resolvedAt: asOf,
            resolvedBy: uuid(99),
            resolutionReason: 'other',
            resolutionNote: 'Excluded fixture',
          }
        : {}),
      derivedWeightLbs: 20 + index,
      derivedWeightSource: 'test_estimate',
      bagCount: 1,
      bagCountSource: 'operator_intake',
      intakeVersion: 1,
      version: 1,
    });
  }
};

describe('list-orders PostgreSQL read model', () => {
  it('paginates ascending UUIDs and excludes resolved work', async () => {
    await seed();
    const repository = makeListOrdersPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    const first = await repository.list(
      { locationId: 'location-1', limit: 1 },
      asOf,
    );
    expect(first.kind).toBe('found');
    if (first.kind !== 'found') return;
    expect(first.page.items).toEqual([
      expect.objectContaining({
        id: uuid(31),
        externalOrderId: 'ORDER-1',
        dueBucket: 'today',
      }),
    ]);
    expect(first.page.nextCursor).not.toBeNull();

    const second = await repository.list(
      {
        locationId: 'location-1',
        limit: 1,
        cursor: first.page.nextCursor ?? '',
      },
      asOf,
    );
    expect(second).toMatchObject({
      kind: 'found',
      page: {
        items: [expect.objectContaining({ id: uuid(32), priority: true })],
        nextCursor: null,
        asOf,
      },
    });
  });

  it('uses strict due bounds and rejects inactive locations and bad cursors', async () => {
    await seed();
    const repository = makeListOrdersPostgresRepository(
      database.db,
      productionTestSchema,
      productionScopeReconciliationTestCapability(database.db),
    );
    await expect(
      repository.list(
        {
          locationId: 'location-1',
          limit: 50,
          dueAfter: new Date('2026-08-21T15:00:00.000Z'),
          dueBefore: new Date('2026-08-21T17:00:00.000Z'),
        },
        asOf,
      ),
    ).resolves.toMatchObject({
      kind: 'found',
      page: { items: [expect.objectContaining({ id: uuid(32) })] },
    });
    await expect(
      repository.list({ locationId: 'location-inactive', limit: 50 }, asOf),
    ).resolves.toEqual({ kind: 'location_not_found' });
    await expect(
      repository.list(
        { locationId: 'location-1', limit: 50, cursor: 'bad' },
        asOf,
      ),
    ).resolves.toEqual({ kind: 'invalid_cursor' });
  });
});
