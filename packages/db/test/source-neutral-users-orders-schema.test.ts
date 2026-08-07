import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig, getTableName } from '../src/query.ts';
import * as orders from '../src/schema/orders.schema.ts';
import * as users from '../src/schema/users.schema.ts';

describe('source-neutral Users and Orders schema', () => {
  it('exports canonical identity, commercial order, and fulfillment tables separately', () => {
    expect(getTableName(users.users)).toBe('users');
    expect(getTableName(users.userSourceLinks)).toBe('user_source_links');
    expect(getTableName(users.userConsents)).toBe('user_consents');
    expect(getTableName(orders.orders)).toBe('orders');
    expect(getTableName(orders.orderItems)).toBe('order_items');
    expect(getTableName(orders.orderFulfillments)).toBe('order_fulfillments');
    expect(getTableName(orders.orderOutboxEvents)).toBe('order_outbox_events');
  });

  it('keeps contact lookup non-unique and exact source identities unique', () => {
    const userIndexes = getTableConfig(users.users).indexes;
    const sourceIndexes = getTableConfig(users.userSourceLinks).indexes;

    expect(
      userIndexes.find((index) => index.config.name === 'users_phone_idx'),
    ).toBeDefined();
    expect(
      userIndexes.find((index) => index.config.name === 'users_email_idx'),
    ).toBeDefined();
    expect(
      sourceIndexes.find(
        (index) =>
          index.config.name === 'user_source_links_source_identity_unique',
      )?.config.unique,
    ).toBe(true);
  });

  it('constrains unresolved customers and outbox leases explicitly', () => {
    expect(
      getTableConfig(orders.orders).checks.map((candidate) => candidate.name),
    ).toEqual(
      expect.arrayContaining([
        'orders_customer_resolution_valid',
        'orders_customer_resolution_consistent',
      ]),
    );
    expect(
      getTableConfig(orders.orderSourceCustomerRefs).checks.map(
        (candidate) => candidate.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'order_source_customer_refs_resolution_valid',
        'order_source_customer_refs_resolution_consistent',
      ]),
    );
    expect(
      getTableConfig(orders.orderOutboxEvents).checks.map(
        (candidate) => candidate.name,
      ),
    ).toContain('order_outbox_events_lease_consistent');
  });

  it('uses one additive migration and never rewrites an existing business table', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0024_source-neutral-users-orders.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE "users"');
    expect(migration).toContain('CREATE TABLE "orders"');
    expect(migration).toContain('CREATE TABLE "order_outbox_events"');
    expect(migration).toContain(
      'ALTER TABLE "auth_identities" ADD COLUMN "user_id" uuid',
    );
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('adds trusted command provenance without invalidating older receipts', async () => {
    expect(
      getTableConfig(users.userCommandReceipts).checks.map(
        (candidate) => candidate.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'user_command_receipts_actor_kind_valid',
        'user_command_receipts_context_present',
      ]),
    );
    expect(
      getTableConfig(orders.orderCommandReceipts).checks.map(
        (candidate) => candidate.name,
      ),
    ).toEqual(
      expect.arrayContaining([
        'order_command_receipts_actor_kind_valid',
        'order_command_receipts_context_present',
      ]),
    );

    const migration = await readFile(
      new URL(
        '../src/migrations/0026_source-neutral-command-context.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const addNullable = migration.indexOf('ADD COLUMN "origin" text;');
    const markLegacy = migration.indexOf('SET "origin" = \'legacy_unknown\'');
    const requireOrigin = migration.indexOf(
      'ALTER COLUMN "origin" SET NOT NULL',
    );

    expect(addNullable).toBeGreaterThanOrEqual(0);
    expect(markLegacy).toBeGreaterThan(addNullable);
    expect(requireOrigin).toBeGreaterThan(markLegacy);
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('stores source lifecycle as typed metadata without rewriting archived payloads', async () => {
    expect(
      getTableConfig(orders.orderSourceSnapshots).columns.map(
        (column) => column.name,
      ),
    ).toContain('source_lifecycle_code');

    const migration = await readFile(
      new URL(
        '../src/migrations/0028_order-source-lifecycle-code.sql',
        import.meta.url,
      ),
      'utf8',
    );
    expect(migration).toContain('ADD COLUMN "source_lifecycle_code" text');
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bUPDATE\b/i);
  });
});
