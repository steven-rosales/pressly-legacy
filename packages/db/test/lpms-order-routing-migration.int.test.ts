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
  new URL('../src/migrations/0020_fair_karma.sql', import.meta.url),
  'utf8',
);

const ids = {
  run: '10000000-0000-4000-8000-000000000001',
  order: '10000000-0000-4000-8000-000000000002',
  batch: '10000000-0000-4000-8000-000000000003',
  actor: '10000000-0000-4000-8000-000000000004',
  sorting: '10000000-0000-4000-8000-000000000010',
  washing: '10000000-0000-4000-8000-000000000011',
  drying: '10000000-0000-4000-8000-000000000012',
  folding: '10000000-0000-4000-8000-000000000013',
} as const;

const createLegacySchema = async (): Promise<string> => {
  const schema = `lpms_order_route_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table production_locations (
      id text primary key
    );
    create table production_runs (
      id uuid primary key,
      location_id text not null,
      unique (id, location_id)
    );
    create table production_orders (
      id uuid primary key,
      location_id text not null,
      due_at timestamptz not null,
      unique (id, location_id)
    );
    create table production_batches (
      id uuid primary key,
      location_id text not null,
      production_run_id uuid not null,
      sequence_index integer not null,
      created_at timestamptz not null,
      unique (id, location_id)
    );
    create table stage_runs (
      id uuid primary key,
      location_id text not null,
      production_batch_id uuid not null,
      stage_kind text not null,
      status text not null,
      actual_end_at timestamptz,
      completed_by uuid,
      updated_at timestamptz not null,
      unique (id, location_id)
    );
    create table production_batch_orders (
      location_id text not null,
      production_batch_id uuid not null,
      production_order_id uuid not null,
      active boolean not null default true,
      placement_provenance text not null default 'initial_schedule',
      pinned_at timestamptz,
      pinned_by uuid,
      constraint production_batch_orders_production_batch_id_production_order_id_pk
        primary key (production_batch_id, production_order_id),
      constraint production_batch_orders_known_placement_provenance
        check (placement_provenance in ('initial_schedule', 'automatic', 'manager_exact')),
      constraint production_batch_orders_pin_valid
        check (
          (placement_provenance = 'manager_exact' and pinned_at is not null and pinned_by is not null)
          or (placement_provenance <> 'manager_exact' and pinned_at is null and pinned_by is null)
        )
    );
    create unique index production_batch_orders_active_unique
      on production_batch_orders (production_order_id)
      where active = true;
    create table work_events (
      id uuid primary key,
      location_id text not null,
      created_at timestamptz not null
    );
  `);
  return schema;
};

const seedLegacyRoute = async (input?: {
  active?: boolean;
  completedWithoutBoundary?: boolean;
}): Promise<void> => {
  const createdAt = '2026-07-15T12:00:00Z';
  await db.unsafe(`
    insert into production_locations (id) values ('location-1');
    insert into production_runs (id, location_id)
      values ('${ids.run}', 'location-1');
    insert into production_orders (id, location_id, due_at)
      values ('${ids.order}', 'location-1', '2026-07-15T20:00:00Z');
    insert into production_batches (
      id, location_id, production_run_id, sequence_index, created_at
    ) values ('${ids.batch}', 'location-1', '${ids.run}', 0, '${createdAt}');
    insert into production_batch_orders (
      location_id, production_batch_id, production_order_id, active,
      placement_provenance
    ) values (
      'location-1', '${ids.batch}', '${ids.order}',
      ${input?.active === false ? 'false' : 'true'}, 'initial_schedule'
    );
    insert into stage_runs (
      id, location_id, production_batch_id, stage_kind, status,
      actual_end_at, completed_by, updated_at
    ) values
      (
        '${ids.sorting}', 'location-1', '${ids.batch}', 'sorting', 'completed',
        ${input?.completedWithoutBoundary ? 'null' : "'2026-07-15T13:00:00Z'"},
        '${ids.actor}', '2026-07-15T13:00:00Z'
      ),
      (
        '${ids.washing}', 'location-1', '${ids.batch}', 'washing', 'planned',
        null, null, '${createdAt}'
      ),
      (
        '${ids.drying}', 'location-1', '${ids.batch}', 'drying', 'planned',
        null, null, '${createdAt}'
      ),
      (
        '${ids.folding}', 'location-1', '${ids.batch}', 'folding_packaging', 'planned',
        null, null, '${createdAt}'
      );
  `);
};

const dropLegacySchema = async (schema: string): Promise<void> => {
  await db.unsafe('set search_path to public');
  await db.unsafe(`drop schema if exists "${schema}" cascade`);
};

const applyMigration = (schema: string) =>
  db.unsafe(migration.replaceAll('"public".', `"${schema}".`));

afterAll(async () => {
  await db.end();
});

describe.sequential('LPMS order-routing migration', () => {
  it('backfills immutable attempts before enforcing route constraints', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyRoute();
      await applyMigration(schema);

      const memberships = await db.unsafe<
        { id: string; placed_at: Date; active: boolean }[]
      >(`select id, placed_at, active from production_batch_orders`);
      expect(memberships).toEqual([
        {
          id: expect.any(String),
          placed_at: new Date('2026-07-15T12:00:00.000Z'),
          active: true,
        },
      ]);

      const attempts = await db.unsafe<
        { stage_kind: string; attempt_number: number; status: string }[]
      >(`
        select stage_kind, attempt_number, status
        from production_order_stage_attempts
        order by case stage_kind
          when 'sorting' then 0
          when 'washing' then 1
          when 'drying' then 2
          else 3
        end
      `);
      expect(attempts).toEqual([
        { stage_kind: 'sorting', attempt_number: 1, status: 'completed' },
        { stage_kind: 'washing', attempt_number: 1, status: 'assigned' },
        { stage_kind: 'drying', attempt_number: 1, status: 'assigned' },
        {
          stage_kind: 'folding_packaging',
          attempt_number: 1,
          status: 'assigned',
        },
      ]);

      await expect(
        db.unsafe(`
          update production_batch_orders
          set released_at = now(), released_by = '${ids.actor}',
              release_reason = 'other'
          where production_order_id = '${ids.order}'
        `),
      ).rejects.toThrow(/production_batch_orders_release_valid/);
      await expect(
        db.unsafe(`
          insert into production_order_stage_attempts (
            location_id, production_run_id, production_order_id, stage_run_id,
            stage_kind, attempt_number, status, assignment_reason
          ) values (
            'location-1', '${ids.run}', '${ids.order}', '${ids.washing}',
            'washing', 2, 'assigned', 'other'
          )
        `),
      ).rejects.toThrow(/production_order_stage_attempts_one_assigned_unique/);
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it('aborts when an inactive membership still owns unfinished work', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyRoute({ active: false });
      await expect(applyMigration(schema)).rejects.toThrow(
        /inactive batch membership has unfinished stage work/,
      );
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it('aborts when completed legacy work has no completion boundary', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyRoute({ completedWithoutBoundary: true });
      await expect(applyMigration(schema)).rejects.toThrow(
        /completed stage has no actual completion boundary/,
      );
    } finally {
      await dropLegacySchema(schema);
    }
  });
});
