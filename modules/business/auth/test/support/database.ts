import type { Database } from '@pressly/db';
import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
  resetTestTables,
  type TestDatabaseRuntime,
} from '@pressly/testkit/database';

const TEST_DATABASE_URL_ENV = 'PRESSLY_TEST_DATABASE_URL';
const TEST_DATABASE_RESET_URL_ENV = 'PRESSLY_TEST_DATABASE_RESET_URL';

export const DEFAULT_AUTH_TEST_DATABASE_URL =
  'postgres://pressly:pressly@localhost:55434/pressly_test';

const AUTH_TEST_TABLES = [
  'auth_audit_events',
  'auth_login_attempts',
  'auth_mfa_recovery_codes',
  'auth_mfa_challenges',
  'auth_mfa_credentials',
  'auth_role_assignments',
  'auth_password_credentials',
  'auth_sessions',
  'auth_identities',
] as const;

export type AuthTestDatabase = TestDatabaseRuntime;

export const getAuthTestDatabaseUrl = (): string => {
  return getTestDatabaseUrl(
    TEST_DATABASE_URL_ENV,
    DEFAULT_AUTH_TEST_DATABASE_URL,
  );
};

export const resetAuthTables = async (db: Database): Promise<void> => {
  await resetTestTables(db, AUTH_TEST_TABLES);
};

export const createAuthTestDatabase = (): AuthTestDatabase => {
  return createTestDatabaseRuntime({
    databaseUrl: getAuthTestDatabaseUrl(),
    tableNames: AUTH_TEST_TABLES,
    maxConnections: 1,
    ...(process.env[TEST_DATABASE_RESET_URL_ENV] === undefined
      ? {}
      : { resetDatabaseUrl: process.env[TEST_DATABASE_RESET_URL_ENV] }),
  });
};
