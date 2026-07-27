import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for resolution migration tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const migration = await readFile(
  new URL(
    '../src/migrations/0033_production-order-resolution.sql',
    import.meta.url,
  ),
  'utf8',
);

const firstOrderId = '10000000-0000-4000-8000-000000000001';
const secondOrderId = '10000000-0000-4000-8000-000000000002';
const thirdOrderId = '10000000-0000-4000-8000-000000000003';
const actorId = '20000000-0000-4000-8000-000000000001';
const bulkOperationId = '30000000-0000-4000-8000-000000000001';

const createFixtureSchema = async (): Promise<string> => {
  const schema = `production_order_resolution_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table production_orders (
      id uuid primary key,
      location_id text not null,
      due_at timestamp with time zone not null
    );

    insert into production_orders (id, location_id, due_at) values
      ('${firstOrderId}', 'location-a', '2026-07-01T16:00:00Z'),
      ('${secondOrderId}', 'location-a', '2026-07-02T16:00:00Z');
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

describe.sequential('production order resolution migration', () => {
  it('adds a safe open default without changing or deleting legacy rows', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);

      const rows = await db.unsafe<
        {
          id: string;
          resolution_state: string;
          resolved_at: Date | null;
          resolved_by: string | null;
          resolution_reason: string | null;
          resolution_note: string | null;
          resolution_bulk_operation_id: string | null;
        }[]
      >(`
        select
          id::text,
          resolution_state,
          resolved_at,
          resolved_by::text,
          resolution_reason,
          resolution_note,
          resolution_bulk_operation_id::text
        from production_orders
        order by id
      `);
      expect(rows).toEqual([
        {
          id: firstOrderId,
          resolution_state: 'open',
          resolved_at: null,
          resolved_by: null,
          resolution_reason: null,
          resolution_note: null,
          resolution_bulk_operation_id: null,
        },
        {
          id: secondOrderId,
          resolution_state: 'open',
          resolved_at: null,
          resolved_by: null,
          resolution_reason: null,
          resolution_note: null,
          resolution_bulk_operation_id: null,
        },
      ]);

      await db.unsafe(`
        insert into production_orders (id, location_id, due_at)
        values ('${thirdOrderId}', 'location-b', '2026-07-03T16:00:00Z')
      `);
      const [inserted] = await db.unsafe<
        { resolution_state: string; metadata_is_null: boolean }[]
      >(`
        select
          resolution_state,
          (
            resolved_at is null
            and resolved_by is null
            and resolution_reason is null
            and resolution_note is null
            and resolution_bulk_operation_id is null
          ) as metadata_is_null
        from production_orders
        where id = '${thirdOrderId}'
      `);
      expect(inserted).toEqual({
        resolution_state: 'open',
        metadata_is_null: true,
      });

      const [index] = await db.unsafe<{ indexdef: string }[]>(`
        select indexdef
        from pg_indexes
        where schemaname = current_schema()
          and indexname = 'production_orders_location_resolution_due_id_idx'
      `);
      expect(index?.indexdef).toMatch(
        /USING btree \(location_id, resolution_state, due_at, id\)$/,
      );
    } finally {
      await dropFixtureSchema(schema);
    }
  });

  it('accepts complete resolution metadata and an explicit metadata-clearing restore', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);

      await db.unsafe(`
        update production_orders
        set
          resolution_state = 'resolved_without_production',
          resolved_at = '2026-07-26T16:00:00Z',
          resolved_by = '${actorId}',
          resolution_reason = 'completed_outside_pressly',
          resolution_note = 'Confirmed by the manager.',
          resolution_bulk_operation_id = '${bulkOperationId}'
        where id = '${firstOrderId}'
      `);

      const [resolved] = await db.unsafe<
        {
          resolution_state: string;
          resolved_by: string;
          resolution_reason: string;
          resolution_note: string;
          resolution_bulk_operation_id: string;
        }[]
      >(`
        select
          resolution_state,
          resolved_by::text,
          resolution_reason,
          resolution_note,
          resolution_bulk_operation_id::text
        from production_orders
        where id = '${firstOrderId}'
      `);
      expect(resolved).toEqual({
        resolution_state: 'resolved_without_production',
        resolved_by: actorId,
        resolution_reason: 'completed_outside_pressly',
        resolution_note: 'Confirmed by the manager.',
        resolution_bulk_operation_id: bulkOperationId,
      });

      await db.unsafe(`
        update production_orders
        set
          resolution_state = 'open',
          resolved_at = null,
          resolved_by = null,
          resolution_reason = null,
          resolution_note = null,
          resolution_bulk_operation_id = null
        where id = '${firstOrderId}'
      `);
      const [restored] = await db.unsafe<
        { resolution_state: string; metadata_is_null: boolean }[]
      >(`
        select
          resolution_state,
          (
            resolved_at is null
            and resolved_by is null
            and resolution_reason is null
            and resolution_note is null
            and resolution_bulk_operation_id is null
          ) as metadata_is_null
        from production_orders
        where id = '${firstOrderId}'
      `);
      expect(restored).toEqual({
        resolution_state: 'open',
        metadata_is_null: true,
      });
    } finally {
      await dropFixtureSchema(schema);
    }
  });

  it('rejects unknown states and incoherent or blank metadata', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);

      await expect(
        db.unsafe(`
          update production_orders
          set resolution_state = 'deleted'
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update production_orders
          set
            resolution_state = 'resolved_without_production',
            resolved_at = now(),
            resolved_by = '${actorId}',
            resolution_reason = 'invented_reason'
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update production_orders
          set
            resolution_state = 'resolved_without_production',
            resolved_at = now(),
            resolved_by = '${actorId}',
            resolution_reason = 'other',
            resolution_note = null
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update production_orders
          set
            resolution_state = 'resolved_without_production',
            resolved_at = now(),
            resolution_reason = 'completed_outside_pressly'
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update production_orders
          set
            resolution_state = 'resolved_without_production',
            resolved_at = now(),
            resolved_by = '${actorId}',
            resolution_reason = '   '
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update production_orders
          set
            resolution_state = 'resolved_without_production',
            resolved_at = now(),
            resolved_by = '${actorId}',
            resolution_reason = 'completed_outside_pressly',
            resolution_note = '   '
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update production_orders
          set resolution_reason = 'completed_outside_pressly'
          where id = '${firstOrderId}'
        `),
      ).rejects.toThrow();
    } finally {
      await dropFixtureSchema(schema);
    }
  });
});
