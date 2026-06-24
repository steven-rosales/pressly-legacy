import type { Database } from '@pressly/db';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  resetTestTables,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';

const TEST_DATABASE_URL_ENV = 'PRESSLY_TEST_DATABASE_URL';

export const DEFAULT_PRICING_TEST_DATABASE_URL =
  'postgres://pressly:pressly@localhost:55434/pressly_test';

const PRICING_TEST_TABLES = [
  'pricing_change_events',
  'pricing_items',
  'pricing_sets',
  'pricing_services',
] as const;

export type PricingTestDatabase = TestDatabaseRuntime;

export const getPricingTestDatabaseUrl = (): string => {
  return getTestDatabaseUrl(
    TEST_DATABASE_URL_ENV,
    DEFAULT_PRICING_TEST_DATABASE_URL,
  );
};

export const resetPricingTables = async (db: Database): Promise<void> => {
  await resetTestTables(db, PRICING_TEST_TABLES);
};

export const createPricingTestDatabase = (): PricingTestDatabase => {
  return createTestDatabaseRuntime({
    databaseUrl: getPricingTestDatabaseUrl(),
    tableNames: PRICING_TEST_TABLES,
    maxConnections: 1,
  });
};
