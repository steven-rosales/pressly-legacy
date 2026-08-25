import { createPostgresRuntime } from '@pressly/postgres/client';
import { seedPricing } from '@pressly/pricing-system/seeding/pricing';
import { presslyPostgresOwnerSchemas } from '@pressly/topology/postgres-schema';
import postgres from 'postgres';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for Pricing seed integration tests.`);
};

const runtimeUrl = requiredUrl('PRESSLY_TEST_RUNTIME_DATABASE_URL');
const pricingSchema = presslyPostgresOwnerSchemas.pricing;
const database = createPostgresRuntime({
  databaseUrl: runtimeUrl,
  schema: pricingSchema,
  maxConnections: 1,
});
const runtime = postgres(runtimeUrl, { max: 1 });
const migration = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const readProtectedGraph = async () => ({
  services: await runtime`
    select id::text, slug, kind, label, is_active
    from pricing_services
    order by slug
  `,
  sets: await runtime`
    select id::text, service_id::text, status, currency
    from pricing_sets
    order by service_id, id
  `,
  items: await runtime`
    select id::text, pricing_set_id::text, code, service, category, name,
           unit, price_cents, sort_order, metadata
    from pricing_items
    order by pricing_set_id, code
  `,
  events: await runtime`
    select id::text, kind, service_slug
    from pricing_change_events
    order by id
  `,
});

beforeEach(async () => {
  await migration`
    truncate table pricing_change_events, pricing_items, pricing_sets,
                   pricing_services restart identity cascade
  `;
});

afterAll(async () => {
  await Promise.all([database.close(), runtime.end(), migration.end()]);
});

describe('protected Pricing seed', () => {
  it('creates the exact public graph once and is idempotent', async () => {
    await seedPricing(database.db);
    const first = await readProtectedGraph();

    expect(first.services).toHaveLength(2);
    expect(first.sets).toHaveLength(2);
    expect(first.items).toHaveLength(32);
    expect(first.events).toEqual([]);
    expect(
      first.items
        .filter((item) => item['code'] === 'delivery_fee')
        .map((item) => item['price_cents']),
    ).toEqual([0, 0]);
    expect(
      first.items.find((item) => item['code'] === 'hang_dry')?.['price_cents'],
    ).toBe(295);
    expect(
      first.items.find((item) => item['code'] === 'launder_press')?.[
        'price_cents'
      ],
    ).toBe(395);

    await seedPricing(database.db);
    await expect(readProtectedGraph()).resolves.toEqual(first);
  });
});
