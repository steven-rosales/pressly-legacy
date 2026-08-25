import { makeCustomersSystem } from '@pressly/customers-system/testing/assembly';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeCustomerTestDatabase } from './postgres-database.fixture.ts';

const databaseFixture = makeCustomerTestDatabase({
  prefix: 'pressly_customers_reference_conformance',
  tableNames: [
    'user_command_receipts',
    'user_duplicate_candidates',
    'user_field_authorities',
    'user_source_snapshots',
    'user_source_links',
    'users',
  ],
  maxConnections: 6,
});
const database = databaseFixture.runtime;

const now = new Date('2026-08-22T18:00:00.000Z');
const businessId = '73000000-0000-4000-8000-000000000001';
const otherBusinessId = '73000000-0000-4000-8000-000000000002';
const customerId = '73000000-0000-4000-8000-000000000010';

const customersSystem = makeCustomersSystem({
  schema: presslyPostgresOwnerSchemas.customers,
  db: database.db,
  clock: { now: () => now },
});

beforeAll(databaseFixture.setup);
beforeEach(async () => {
  await database.reset();
  await database.db.insert(presslyPostgresOwnerSchemas.customers.users).values({
    id: customerId,
    businessId,
    version: 3,
    firstName: 'Ada',
    lastName: 'Lovelace',
    businessName: null,
    phone: '+12015550101',
    email: 'ada@example.com',
    active: false,
    createdAt: now,
    updatedAt: now,
  });
});
afterAll(databaseFixture.teardown);

describe('Customers reference capability', () => {
  it('returns exact data without exposing persistence and scopes misses by business', async () => {
    const capability = customersSystem.capabilities.customerReferenceV1;
    await expect(
      Promise.all([
        capability.execute({ businessId, customerId }),
        capability.execute({ businessId: otherBusinessId, customerId }),
        capability.execute({
          businessId,
          customerId: '73000000-0000-4000-8000-000000000404',
        }),
      ]),
    ).resolves.toEqual([
      {
        customerId,
        businessId,
        version: 3,
        active: false,
        profile: {
          firstName: 'Ada',
          lastName: 'Lovelace',
          businessName: null,
          phone: '+12015550101',
          email: 'ada@example.com',
        },
      },
      null,
      null,
    ]);
  });
});
