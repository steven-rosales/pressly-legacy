import { seedProductionLocationTestFacts } from '../../../testing/production-schema.spec-support.ts';
import { productionScopeReconciliationTestCapability } from '../../../testing/production-capabilities.spec-support.ts';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeListLocationsPostgresRepository } from './postgres.ts';

const database = createTestDatabaseRuntime({
  databaseUrl: getTestDatabaseUrl(
    'PRESSLY_TEST_DATABASE_URL',
    'postgres://pressly:pressly@localhost:55434/pressly_test',
  ),
  tableNames: ['production_locations'],
  maxConnections: 1,
  ...(process.env['PRESSLY_TEST_DATABASE_RESET_URL'] === undefined
    ? {}
    : { resetDatabaseUrl: process.env['PRESSLY_TEST_DATABASE_RESET_URL'] }),
});

beforeAll(database.check);
beforeEach(database.reset);
afterAll(database.close);

describe('list-locations PostgreSQL read model', () => {
  it('orders by name/id and preserves active and authorization filters', async () => {
    await seedProductionLocationTestFacts(database.db, [
      {
        id: 'location-2',
        businessId: '00000000-0000-4000-8000-000000000100',
        name: 'Beta',
        timezone: 'America/Chicago',
        isActive: false,
      },
      {
        id: 'location-3',
        businessId: '00000000-0000-4000-8000-000000000100',
        name: 'Alpha',
        timezone: 'America/New_York',
      },
      {
        id: 'location-1',
        businessId: '00000000-0000-4000-8000-000000000100',
        name: 'Alpha',
        timezone: 'America/New_York',
      },
    ]);
    const repository = makeListLocationsPostgresRepository(
      productionScopeReconciliationTestCapability(database.db),
    );

    await expect(
      repository.list({ includeInactive: false, allowedLocationIds: null }),
    ).resolves.toEqual([
      expect.objectContaining({ id: 'location-1' }),
      expect.objectContaining({ id: 'location-3' }),
    ]);
    await expect(
      repository.list({
        includeInactive: true,
        allowedLocationIds: ['location-2'],
      }),
    ).resolves.toEqual([expect.objectContaining({ id: 'location-2' })]);
    await expect(
      repository.list({ includeInactive: true, allowedLocationIds: [] }),
    ).resolves.toEqual([]);
  });
});
