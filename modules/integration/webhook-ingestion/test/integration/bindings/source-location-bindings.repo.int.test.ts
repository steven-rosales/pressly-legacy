import * as business from '@pressly/db/schema/business';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makePostgresReconcileSourceLocationBindingsRepository } from '../../../src/features/bindings/reconcile-source-location-bindings/reconcile-source-location-bindings.repo.ts';
import { makePostgresResolveSourceLocationRepository } from '../../../src/features/bindings/resolve-source-location/resolve-source-location.repo.ts';

const runtime = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: [
    'source_location_bindings',
    'production_locations',
    'business_accounts',
  ],
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : {
        resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'],
      }),
});

const now = new Date('2026-08-05T14:00:00.000Z');
const businessId = '00000000-0000-4000-8000-000000000100';

beforeAll(runtime.check);
beforeEach(async () => {
  await runtime.reset();
  await runtime.db.insert(business.businessAccounts).values({
    id: businessId,
    slug: 'webhook-binding-tests',
    displayName: 'Webhook Binding Tests',
  });
  await runtime.db.insert(business.productionLocations).values([
    {
      id: 'location-1',
      businessId,
      name: 'Primary Location',
      timezone: 'America/New_York',
    },
    {
      id: 'location-2',
      businessId,
      name: 'Secondary Location',
      timezone: 'America/New_York',
    },
  ]);
});
afterAll(runtime.close);

describe('source-location binding Postgres repositories', () => {
  it('persists reconciliation additions and resolves only exact active bindings', async () => {
    const reconcile = makePostgresReconcileSourceLocationBindingsRepository(
      runtime.db,
    );
    const resolve = makePostgresResolveSourceLocationRepository(runtime.db);
    const bindings = [
      {
        source: 'cents',
        externalLocationId: 'store-1',
        locationId: 'location-1',
        isActive: true,
      },
      {
        source: 'cents',
        externalLocationId: 'store-2',
        locationId: 'location-2',
        isActive: false,
      },
    ] as const;

    await reconcile.insert(bindings, now);

    const stored = await reconcile.loadAll();
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining([...bindings]));
    await expect(
      resolve({ source: 'cents', externalLocationId: 'store-1' }),
    ).resolves.toBe('location-1');
    await expect(
      resolve({ source: 'cents', externalLocationId: 'store-2' }),
    ).resolves.toBeNull();
    await expect(
      resolve({ source: 'another-source', externalLocationId: 'store-1' }),
    ).resolves.toBeNull();
  });
});
