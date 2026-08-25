import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';
import {
  createPostgresRuntime,
  type PostgresDatabase,
} from '@pressly/postgres/client';
import { truncateTestTables } from '@pressly/postgres/testing';

export type TestDatabaseRuntime = Readonly<{
  db: PostgresDatabase;
  check: () => Promise<void>;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}>;

export type TestDatabaseRuntimeInput = Readonly<{
  databaseUrl: string;
  tableNames: readonly string[];
  maxConnections?: number;
  resetDatabaseUrl?: string;
}>;

export const assertTestRuntime = (): void => {
  if (process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true')
    return;

  throw invariantViolationError({
    code: 'test_database_outside_test_runtime',
    message: 'Test database helpers can only run in a test runtime.',
    safeMessage: 'Test database setup is invalid.',
  });
};

export const assertSafeTestDatabaseUrl = (databaseUrl: string): void => {
  const url = new URL(databaseUrl);
  const databaseName = url.pathname.replace(/^\//, '');

  if (databaseName.includes('test')) return;

  throw configError({
    code: 'unsafe_test_database_url',
    message: `Refusing to reset a non-test database: ${databaseName}.`,
    safeMessage: 'Test database configuration is invalid.',
  });
};

export const getTestDatabaseUrl = (
  envName: string,
  defaultDatabaseUrl: string,
): string => {
  const databaseUrl = process.env[envName] ?? defaultDatabaseUrl;

  assertSafeTestDatabaseUrl(databaseUrl);

  return databaseUrl;
};

const assertSafeTableName = (tableName: string): void => {
  if (/^[a-z][a-z0-9_]*$/.test(tableName)) return;

  throw configError({
    code: 'unsafe_test_table_name',
    message: `Refusing to truncate unsafe table name: ${tableName}.`,
    safeMessage: 'Test database configuration is invalid.',
  });
};

export const resetTestTables = async (
  db: PostgresDatabase,
  tableNames: readonly string[],
): Promise<void> => {
  assertTestRuntime();

  if (tableNames.length === 0)
    throw configError({
      code: 'missing_test_table_names',
      message: 'At least one test table name is required before truncating.',
      safeMessage: 'Test database configuration is invalid.',
    });

  for (const tableName of tableNames) assertSafeTableName(tableName);

  await truncateTestTables(db, tableNames);
};

export const createTestDatabaseRuntime = (
  input: TestDatabaseRuntimeInput,
): TestDatabaseRuntime => {
  assertTestRuntime();
  assertSafeTestDatabaseUrl(input.databaseUrl);

  const runtime = createPostgresRuntime({
    databaseUrl: input.databaseUrl,
    schema: {},
    maxConnections: input.maxConnections ?? 1,
  });
  const resetRuntime = input.resetDatabaseUrl
    ? createPostgresRuntime({
        databaseUrl: input.resetDatabaseUrl,
        schema: {},
        maxConnections: 1,
      })
    : runtime;

  return {
    db: runtime.db,
    check: runtime.check,
    reset: () => resetTestTables(resetRuntime.db, input.tableNames),
    close: async () => {
      await runtime.close();
      if (resetRuntime !== runtime) await resetRuntime.close();
    },
  };
};
