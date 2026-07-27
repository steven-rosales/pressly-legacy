import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for execution-state migration tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const migration = await readFile(
  new URL(
    '../src/migrations/0032_production-order-execution-state.sql',
    import.meta.url,
  ),
  'utf8',
);

const createFixtureSchema = async (): Promise<string> => {
  const schema = `production_order_execution_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table production_orders (
      id uuid primary key,
      location_id text not null,
      status text not null
    );

    insert into production_orders (id, location_id, status) values
      ('10000000-0000-4000-8000-000000000001', 'location-a', 'release_pending'),
      ('10000000-0000-4000-8000-000000000002', 'location-a', 'intake_pending'),
      ('10000000-0000-4000-8000-000000000003', 'location-a', 'eligible'),
      ('10000000-0000-4000-8000-000000000004', 'location-a', 'ineligible'),
      ('10000000-0000-4000-8000-000000000005', 'location-a', 'scheduled'),
      ('10000000-0000-4000-8000-000000000006', 'location-a', 'finished');
  `);
  return schema;
};

const dropFixtureSchema = async (schema: string): Promise<void> => {
  await db.unsafe('set search_path to public');
  await db.unsafe(`drop schema if exists "${schema}" cascade`);
};

afterAll(async () => {
  await db.end();
});

describe.sequential('production order execution-state migration', () => {
  it('backfills deterministic execution truth without inventing readiness transitions', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);

      const rows = await db.unsafe<
        { status: string; execution_status: string }[]
      >(`
        select status, execution_status
        from production_orders
        order by id
      `);
      expect(rows).toEqual([
        { status: 'release_pending', execution_status: 'unassigned' },
        { status: 'intake_pending', execution_status: 'unassigned' },
        { status: 'eligible', execution_status: 'unassigned' },
        { status: 'ineligible', execution_status: 'unassigned' },
        { status: 'scheduled', execution_status: 'scheduled' },
        { status: 'finished', execution_status: 'finished' },
      ]);

      // A rolled-back/older binary can continue writing the legacy column
      // because the additive execution column has a safe default and no
      // trigger. New code resolves this pair monotonically as scheduled and
      // retains the raw execution value for its compare-and-swap.
      await db.unsafe(`
        update production_orders
        set status = 'scheduled'
        where id = '10000000-0000-4000-8000-000000000003'
      `);
      const [mixedVersion] = await db.unsafe<
        { status: string; execution_status: string }[]
      >(`
        select status, execution_status
        from production_orders
        where id = '10000000-0000-4000-8000-000000000003'
      `);
      expect(mixedVersion).toEqual({
        status: 'scheduled',
        execution_status: 'unassigned',
      });

      const converged = await db.unsafe<{ id: string }[]>(`
        update production_orders
        set status = 'finished', execution_status = 'finished'
        where id = '10000000-0000-4000-8000-000000000003'
          and status = 'scheduled'
          and execution_status = 'unassigned'
        returning id::text
      `);
      expect(converged).toHaveLength(1);

      await db.unsafe(`
        insert into production_orders (id, location_id, status)
        values (
          '10000000-0000-4000-8000-000000000007',
          'location-a',
          'eligible'
        )
      `);
      const [inserted] = await db.unsafe<
        { execution_status: string; execution_status_is_null: boolean }[]
      >(`
        select
          execution_status,
          execution_status is null as execution_status_is_null
        from production_orders
        where id = '10000000-0000-4000-8000-000000000007'
      `);
      expect(inserted).toEqual({
        execution_status: 'unassigned',
        execution_status_is_null: false,
      });

      await expect(
        db.unsafe(`
          update production_orders
          set execution_status = 'reopened'
          where id = '10000000-0000-4000-8000-000000000007'
        `),
      ).rejects.toThrow();
    } finally {
      await dropFixtureSchema(schema);
    }
  });
});
