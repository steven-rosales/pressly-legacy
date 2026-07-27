import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for execution repair migration tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const migration = await readFile(
  new URL(
    '../src/migrations/0031_repair-empty-production-execution-graphs.sql',
    import.meta.url,
  ),
  'utf8',
);

const ids = {
  location: '10000000-0000-4000-8000-000000000001',
  emptyShift: '20000000-0000-4000-8000-000000000001',
  partialShift: '20000000-0000-4000-8000-000000000002',
  selectedShift: '20000000-0000-4000-8000-000000000003',
  emptySchedule: '30000000-0000-4000-8000-000000000001',
  partialSchedule: '30000000-0000-4000-8000-000000000002',
  selectedSchedule: '30000000-0000-4000-8000-000000000003',
  emptyRun: '40000000-0000-4000-8000-000000000001',
  partialRun: '40000000-0000-4000-8000-000000000002',
  selectedRun: '40000000-0000-4000-8000-000000000003',
  emptyBatchOne: '50000000-0000-4000-8000-000000000001',
  emptyBatchTwo: '50000000-0000-4000-8000-000000000002',
  partialEmptyBatch: '50000000-0000-4000-8000-000000000003',
  partialPopulatedBatch: '50000000-0000-4000-8000-000000000004',
  selectedEmptyBatch: '50000000-0000-4000-8000-000000000005',
  partialOrder: '60000000-0000-4000-8000-000000000001',
  selectedOrder: '60000000-0000-4000-8000-000000000002',
} as const;

const createFixtureSchema = async (): Promise<string> => {
  const schema = `production_execution_repair_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table production_shifts (
      id uuid primary key,
      status text not null,
      version integer not null,
      updated_at timestamptz not null
    );
    create table schedule_runs (
      id uuid primary key,
      status text not null,
      superseded_at timestamptz
    );
    create table production_orders (
      id uuid primary key,
      location_id uuid not null,
      derived_weight_lbs numeric not null
    );
    create table production_shift_selected_orders (
      production_shift_id uuid not null
        references production_shifts (id),
      production_order_id uuid not null
        references production_orders (id),
      primary key (production_shift_id, production_order_id)
    );
    create table production_runs (
      id uuid primary key,
      location_id uuid not null,
      production_shift_id uuid not null
        references production_shifts (id),
      schedule_run_id uuid not null references schedule_runs (id),
      planned_completion_at timestamptz not null,
      queue_version integer not null,
      version integer not null,
      overtime_proposal_hash text,
      overtime_queue_version integer,
      overtime_acknowledged_by uuid,
      overtime_acknowledged_at timestamptz,
      updated_at timestamptz not null
    );
    create table production_batches (
      id uuid primary key,
      location_id uuid not null,
      production_run_id uuid not null
        references production_runs (id) on delete cascade,
      sequence_index integer not null,
      status text not null,
      derived_weight_lbs numeric not null,
      planned_done_at timestamptz not null,
      version integer not null,
      updated_at timestamptz not null,
      unique (production_run_id, sequence_index)
    );
    create table production_batch_orders (
      production_batch_id uuid not null
        references production_batches (id) on delete cascade,
      production_order_id uuid not null
        references production_orders (id),
      location_id uuid not null,
      active boolean not null,
      primary key (production_batch_id, production_order_id)
    );
    create table stage_runs (
      id uuid primary key,
      location_id uuid not null,
      production_batch_id uuid not null
        references production_batches (id) on delete cascade
    );
    create table stage_machine_assignments (
      id uuid primary key,
      stage_run_id uuid not null references stage_runs (id) on delete cascade
    );
    create table production_order_stage_attempts (
      id uuid primary key,
      location_id uuid not null,
      production_run_id uuid not null
        references production_runs (id) on delete cascade,
      stage_run_id uuid not null references stage_runs (id)
    );
    create table work_events (
      id uuid primary key,
      entity_type text not null,
      entity_id uuid not null
    );
  `);

  await db.unsafe(`
    insert into production_shifts (id, status, version, updated_at) values
      ('${ids.emptyShift}', 'open', 1, '2026-07-22T18:00:00Z'),
      ('${ids.partialShift}', 'open', 1, '2026-07-22T18:00:00Z'),
      ('${ids.selectedShift}', 'open', 1, '2026-07-22T18:00:00Z');

    insert into schedule_runs (id, status, superseded_at) values
      ('${ids.emptySchedule}', 'accepted', null),
      ('${ids.partialSchedule}', 'accepted', null),
      ('${ids.selectedSchedule}', 'accepted', null);

    insert into production_orders (
      id, location_id, derived_weight_lbs
    ) values
      ('${ids.partialOrder}', '${ids.location}', 42),
      ('${ids.selectedOrder}', '${ids.location}', 18);

    insert into production_shift_selected_orders (
      production_shift_id, production_order_id
    ) values (
      '${ids.selectedShift}',
      '${ids.selectedOrder}'
    );

    insert into production_runs (
      id,
      location_id,
      production_shift_id,
      schedule_run_id,
      planned_completion_at,
      queue_version,
      version,
      updated_at
    ) values
      (
        '${ids.emptyRun}',
        '${ids.location}',
        '${ids.emptyShift}',
        '${ids.emptySchedule}',
        '2026-07-23T01:00:00Z',
        1,
        1,
        '2026-07-22T18:00:00Z'
      ),
      (
        '${ids.partialRun}',
        '${ids.location}',
        '${ids.partialShift}',
        '${ids.partialSchedule}',
        '2026-07-23T02:00:00Z',
        1,
        1,
        '2026-07-22T18:00:00Z'
      ),
      (
        '${ids.selectedRun}',
        '${ids.location}',
        '${ids.selectedShift}',
        '${ids.selectedSchedule}',
        '2026-07-23T03:00:00Z',
        1,
        1,
        '2026-07-22T18:00:00Z'
      );

    insert into production_batches (
      id,
      location_id,
      production_run_id,
      sequence_index,
      status,
      derived_weight_lbs,
      planned_done_at,
      version,
      updated_at
    ) values
      (
        '${ids.emptyBatchOne}',
        '${ids.location}',
        '${ids.emptyRun}',
        0,
        'sorting',
        100,
        '2026-07-22T23:00:00Z',
        1,
        '2026-07-22T18:00:00Z'
      ),
      (
        '${ids.emptyBatchTwo}',
        '${ids.location}',
        '${ids.emptyRun}',
        1,
        'queued',
        100,
        '2026-07-23T01:00:00Z',
        1,
        '2026-07-22T18:00:00Z'
      ),
      (
        '${ids.partialEmptyBatch}',
        '${ids.location}',
        '${ids.partialRun}',
        0,
        'queued',
        99,
        '2026-07-22T23:00:00Z',
        1,
        '2026-07-22T18:00:00Z'
      ),
      (
        '${ids.partialPopulatedBatch}',
        '${ids.location}',
        '${ids.partialRun}',
        1,
        'queued',
        99,
        '2026-07-23T00:30:00Z',
        1,
        '2026-07-22T18:00:00Z'
      ),
      (
        '${ids.selectedEmptyBatch}',
        '${ids.location}',
        '${ids.selectedRun}',
        0,
        'queued',
        18,
        '2026-07-23T03:00:00Z',
        1,
        '2026-07-22T18:00:00Z'
      );

    insert into production_batch_orders (
      production_batch_id,
      production_order_id,
      location_id,
      active
    ) values (
      '${ids.partialPopulatedBatch}',
      '${ids.partialOrder}',
      '${ids.location}',
      true
    );

    insert into stage_runs (id, location_id, production_batch_id)
    select
      gen_random_uuid(),
      '${ids.location}',
      batch.id
    from production_batches as batch;

    insert into stage_machine_assignments (id, stage_run_id)
    select gen_random_uuid(), stage.id
    from stage_runs as stage;

    insert into work_events (id, entity_type, entity_id)
    select gen_random_uuid(), 'production_run', run.id
    from production_runs as run
    union all
    select gen_random_uuid(), 'production_batch', batch.id
    from production_batches as batch
    union all
    select gen_random_uuid(), 'stage_run', stage.id
    from stage_runs as stage;
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

describe.sequential('empty production execution graph repair migration', () => {
  it('retires only provably empty execution containers and is idempotent', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);
      await db.unsafe(migration);

      const runs = await db.unsafe<
        {
          id: string;
          planned_completion_at: string;
          queue_version: number;
          version: number;
        }[]
      >(`
        select
          id::text,
          planned_completion_at::text,
          queue_version,
          version
        from production_runs
        order by id
      `);
      expect(runs).toEqual([
        {
          id: ids.partialRun,
          planned_completion_at: '2026-07-23 00:30:00+00',
          queue_version: 2,
          version: 2,
        },
      ]);

      const batches = await db.unsafe<
        {
          id: string;
          sequence_index: number;
          derived_weight_lbs: string;
          version: number;
        }[]
      >(`
        select
          id::text,
          sequence_index,
          derived_weight_lbs::text,
          version
        from production_batches
        order by id
      `);
      expect(batches).toEqual([
        {
          id: ids.partialPopulatedBatch,
          sequence_index: 0,
          derived_weight_lbs: '42',
          version: 2,
        },
      ]);

      const shifts = await db.unsafe<
        { id: string; status: string; version: number }[]
      >(`
        select id::text, status, version
        from production_shifts
        order by id
      `);
      expect(shifts).toEqual([
        { id: ids.emptyShift, status: 'closed', version: 2 },
        { id: ids.partialShift, status: 'open', version: 1 },
        { id: ids.selectedShift, status: 'open', version: 1 },
      ]);

      const schedules = await db.unsafe<
        { id: string; status: string; superseded: boolean }[]
      >(`
        select
          id::text,
          status,
          superseded_at is not null as superseded
        from schedule_runs
        order by id
      `);
      expect(schedules).toEqual([
        {
          id: ids.emptySchedule,
          status: 'superseded',
          superseded: true,
        },
        {
          id: ids.partialSchedule,
          status: 'accepted',
          superseded: false,
        },
        {
          id: ids.selectedSchedule,
          status: 'superseded',
          superseded: true,
        },
      ]);

      const [residue] = await db.unsafe<
        {
          stages: number;
          assignments: number;
          work_events: number;
          invalid_batches: number;
        }[]
      >(`
        select
          (select count(*)::integer from stage_runs) as stages,
          (
            select count(*)::integer
            from stage_machine_assignments
          ) as assignments,
          (select count(*)::integer from work_events) as work_events,
          (
            select count(*)::integer
            from production_batches as batch
            where not exists (
              select 1
              from production_batch_orders as membership
              where membership.production_batch_id = batch.id
                and (
                  membership.active = true
                  or batch.status = 'finished'
                )
            )
          ) as invalid_batches
      `);
      expect(residue).toEqual({
        stages: 1,
        assignments: 1,
        work_events: 3,
        invalid_batches: 0,
      });
    } finally {
      await dropFixtureSchema(schema);
    }
  });
});
