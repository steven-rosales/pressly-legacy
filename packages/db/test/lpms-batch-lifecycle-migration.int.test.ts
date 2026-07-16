import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for LPMS migration tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const migration = await readFile(
  new URL(
    '../src/migrations/0019_production-batch-lifecycle-timestamps.sql',
    import.meta.url,
  ),
  'utf8',
);

const createLegacySchema = async (): Promise<string> => {
  const schema = `lpms_batch_lifecycle_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table production_batches (
      id uuid primary key,
      status text not null,
      started_at timestamptz,
      finished_at timestamptz,
      membership_frozen_at timestamptz,
      updated_at timestamptz not null
    )
  `);
  return schema;
};

const dropLegacySchema = async (schema: string): Promise<void> => {
  await db.unsafe('set search_path to public');
  await db.unsafe(`drop schema if exists "${schema}" cascade`);
};

afterAll(async () => {
  await db.end();
});

describe.sequential('LPMS batch lifecycle timestamp migration', () => {
  it('uses the existing freeze time as a lifecycle anchor before adding the check', async () => {
    const schema = await createLegacySchema();
    try {
      await db.unsafe(`
        insert into production_batches (
          id, status, started_at, finished_at, membership_frozen_at, updated_at
        ) values (
          '00000000-0000-4000-8000-000000000001',
          'drying',
          null,
          null,
          '2026-07-15T14:30:00Z',
          '2026-07-15T14:31:00Z'
        )
      `);

      await db.unsafe(migration);

      const [stored] = await db.unsafe<
        { started_at: Date; finished_at: Date | null }[]
      >(`
        select started_at, finished_at
        from production_batches
        where id = '00000000-0000-4000-8000-000000000001'
      `);
      expect(stored).toEqual({
        started_at: new Date('2026-07-15T14:30:00.000Z'),
        finished_at: null,
      });

      await expect(
        db.unsafe(`
          update production_batches
          set status = 'queued'
          where id = '00000000-0000-4000-8000-000000000001'
        `),
      ).rejects.toThrow(/production_batches_lifecycle_timestamps_valid/);
      await expect(
        db.unsafe(`
          update production_batches
          set status = 'finished'
          where id = '00000000-0000-4000-8000-000000000001'
        `),
      ).rejects.toThrow(/production_batches_lifecycle_timestamps_valid/);
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it('aborts before mutation when queued timestamps contradict lifecycle state', async () => {
    const schema = await createLegacySchema();
    try {
      await db.unsafe(`
        insert into production_batches (
          id, status, started_at, finished_at, membership_frozen_at, updated_at
        ) values (
          '00000000-0000-4000-8000-000000000002',
          'queued',
          '2026-07-15T14:30:00Z',
          null,
          null,
          '2026-07-15T14:31:00Z'
        )
      `);

      await expect(db.unsafe(migration)).rejects.toThrow(
        /LPMS_BATCH_LIFECYCLE_MIGRATION_INCONSISTENT_TIMESTAMPS/,
      );

      const [stored] = await db.unsafe<{ status: string; started_at: Date }[]>(`
        select status, started_at
        from production_batches
        where id = '00000000-0000-4000-8000-000000000002'
      `);
      expect(stored).toEqual({
        status: 'queued',
        started_at: new Date('2026-07-15T14:30:00.000Z'),
      });

      const [constraint] = await db.unsafe<{ present: boolean }[]>(`
        select exists (
          select 1
          from information_schema.table_constraints
          where table_schema = '${schema}'
            and table_name = 'production_batches'
            and constraint_name = 'production_batches_lifecycle_timestamps_valid'
        ) as present
      `);
      expect(constraint?.present).toBe(false);
    } finally {
      await dropLegacySchema(schema);
    }
  });
});
