import {
  createTestDatabaseRuntime,
  getTestDatabaseUrl,
} from '@pressly/testkit/database';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import type { ResolveExactSourceCustomerCommand } from '../cells/sources/resolve-exact-source-customer/types.ts';
import { makeCustomersSystem } from '../system.ts';
import { customersTestSchema } from './schema.ts';

const customersDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_CUSTOMERS_SYSTEM_TEST_DATABASE_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_customers_system_test',
);
const customersResetDatabaseUrl = getTestDatabaseUrl(
  'PRESSLY_CUSTOMERS_SYSTEM_TEST_DATABASE_RESET_URL',
  'postgres://pressly:pressly@localhost:55434/pressly_customers_system_test',
);

export const customersPostgresDatabase = createTestDatabaseRuntime({
  databaseUrl: customersDatabaseUrl,
  resetDatabaseUrl: customersResetDatabaseUrl,
  tableNames: [
    'user_command_receipts',
    'user_consents',
    'user_duplicate_candidates',
    'user_field_authorities',
    'user_source_snapshots',
    'user_source_links',
    'users',
  ],
  maxConnections: 6,
});
const customersPostgresFaultRuntime = createPostgresRuntime({
  databaseUrl: customersResetDatabaseUrl,
  schema: {},
  maxConnections: 1,
});
export const customersPostgresFaultDatabase = customersPostgresFaultRuntime.db;

export const customersPostgresNow = new Date('2026-08-22T16:00:00.000Z');
export const customersBusinessId = '71000000-0000-4000-8000-000000000001';
export const customersOtherBusinessId = '71000000-0000-4000-8000-000000000002';
export const customersCommandContext = {
  origin: 'pressly_dashboard',
  principal: { kind: 'human', id: 'identity-1' },
} as const;
export const emptyCustomerProfile = {
  firstName: null,
  lastName: null,
  businessName: null,
  phone: null,
  email: null,
};

export const registerCustomersPostgresLifecycle = (): void => {
  beforeAll(async () => {
    await customersPostgresDatabase.check();
    await customersPostgresFaultRuntime.check();
  });
  beforeEach(async () => {
    await customersPostgresDatabase.reset();
  });
  afterAll(async () => {
    await customersPostgresDatabase.close();
    await customersPostgresFaultRuntime.close();
  });
};

export const makeCustomersPostgresSystem = () =>
  makeCustomersSystem({
    db: customersPostgresDatabase.db,
    schema: customersTestSchema,
    clock: { now: () => customersPostgresNow },
  });

export const makeSourceCustomerCommand = (
  input: Readonly<{
    businessId?: string;
    externalUserId?: string;
    idempotencyKey?: string;
    hash?: string;
  }> = {},
): ResolveExactSourceCustomerCommand => ({
  businessId: input.businessId ?? customersBusinessId,
  source: 'cents',
  externalUserId: input.externalUserId ?? 'customer-1',
  profile: {
    ...emptyCustomerProfile,
    firstName: 'Ada',
    phone: '+12015550101',
  },
  revision: {
    at: customersPostgresNow,
    hash: input.hash ?? 'a'.repeat(64),
    adapterVersion: 'cents-v1',
    observedAt: customersPostgresNow,
    normalizedPayload: { customer: { id: 'customer-1' } },
  },
  idempotencyKey: input.idempotencyKey ?? 'proposal-1:customer',
  context: customersCommandContext,
  now: customersPostgresNow,
});
