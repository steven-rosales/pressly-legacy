import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from '../src/query.ts';
import * as laundryProduction from '../src/schema/laundry-production.schema.ts';
import * as orders from '../src/schema/orders.schema.ts';

describe('source-neutral Production demand schema', () => {
  it('links exactly one Production demand to one canonical fulfillment', () => {
    const demand = getTableConfig(laundryProduction.orderDemands);

    expect(
      demand.indexes.find(
        (index) => index.config.name === 'order_demands_fulfillment_unique',
      )?.config.unique,
    ).toBe(true);
    expect(demand.foreignKeys).toHaveLength(2);
    expect(demand.checks.map((check) => check.name)).toEqual(
      expect.arrayContaining([
        'order_demands_fulfillment_version_positive',
        'order_demands_projection_hash_shape',
        'order_demands_admission_state_valid',
        'order_demands_commercial_state_valid',
      ]),
    );
    expect(getTableConfig(orders.orderFulfillments).name).toBe(
      'order_fulfillments',
    );
  });

  it('expands, backfills, and only then requires canonical fulfillment identity', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0025_source-neutral-production-demand.sql',
        import.meta.url,
      ),
      'utf8',
    );
    const addNullable = migration.indexOf(
      'ALTER TABLE "order_demands" ADD COLUMN "fulfillment_id" uuid;',
    );
    const backfillOrders = migration.indexOf('INSERT INTO "orders"');
    const backfillFulfillments = migration.indexOf(
      'INSERT INTO "order_fulfillments"',
    );
    const linkDemand = migration.indexOf('UPDATE "order_demands" AS demand');
    const requireLink = migration.indexOf(
      'ALTER TABLE "order_demands" ALTER COLUMN "fulfillment_id" SET NOT NULL',
    );

    expect(addNullable).toBeGreaterThanOrEqual(0);
    expect(backfillOrders).toBeGreaterThan(addNullable);
    expect(backfillFulfillments).toBeGreaterThan(backfillOrders);
    expect(linkDemand).toBeGreaterThan(backfillFulfillments);
    expect(requireLink).toBeGreaterThan(linkDemand);
    expect(migration).toContain("'legacy_unknown'");
    expect(migration).toMatch(/'legacy_unknown',\s+NULL,/);
    expect(migration).toContain("'legacy-production-v1'");
  });

  it('retains compatibility columns without destructive migration statements', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0025_source-neutral-production-demand.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain('"demand_key"');
    expect(migration).toContain('"source_status_code"');
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});
