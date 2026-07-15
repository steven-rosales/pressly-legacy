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
    '../src/migrations/0016_lpms-run-centered-online-scheduling.sql',
    import.meta.url,
  ),
  'utf8',
);

const ids = {
  actor: '00000000-0000-4000-8000-000000000001',
  shift: '00000000-0000-4000-8000-000000000002',
  config: '00000000-0000-4000-8000-000000000003',
  schedule: '00000000-0000-4000-8000-000000000004',
  run: '00000000-0000-4000-8000-000000000005',
  batch: '00000000-0000-4000-8000-000000000006',
  order: '00000000-0000-4000-8000-000000000007',
  stage: '00000000-0000-4000-8000-000000000008',
  assignment: '00000000-0000-4000-8000-000000000009',
  event: '00000000-0000-4000-8000-000000000010',
  scheduleTwo: '00000000-0000-4000-8000-000000000011',
  runTwo: '00000000-0000-4000-8000-000000000012',
} as const;

const createLegacySchema = async (): Promise<string> => {
  const schema = `lpms_migration_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table scheduler_configs (
      id uuid primary key,
      location_id text not null,
      pulse_minutes integer not null,
      fold_lbs_per_folder_minute numeric(12, 3) not null,
      algorithm_version text not null,
      version integer not null,
      stage_fit_assertion jsonb not null,
      asserted_by uuid not null,
      published_at timestamptz not null default now(),
      unique (location_id, version)
    );
    create table schedule_runs (
      id uuid primary key,
      location_id text not null,
      production_shift_id uuid not null,
      scheduler_config_id uuid not null,
      status text not null default 'draft',
      input_snapshot jsonb not null,
      input_snapshot_hash text not null,
      output_plan jsonb not null,
      output_plan_hash text not null,
      algorithm_version text not null,
      pulse_capacity_lbs numeric(12, 3) not null,
      batch_count integer not null,
      makespan_minutes integer not null,
      planned_completion_at timestamptz not null,
      warnings_json jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      accepted_at timestamptz
    );
    create unique index schedule_runs_canonical_proposal_unique
      on schedule_runs (
        production_shift_id, scheduler_config_id, input_snapshot_hash,
        output_plan_hash
      );
    create table production_runs (
      id uuid primary key,
      location_id text not null,
      production_shift_id uuid not null,
      schedule_run_id uuid not null,
      status text not null default 'planned',
      started_at timestamptz,
      completed_at timestamptz,
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table production_batches (
      id uuid primary key,
      location_id text not null,
      production_run_id uuid not null references production_runs(id) on delete cascade,
      sequence_index integer not null,
      status text not null default 'queued',
      pulse_capacity_lbs numeric(12, 3) not null,
      derived_weight_lbs numeric(12, 3) not null,
      pulse_minutes integer not null,
      planned_done_at timestamptz not null,
      started_at timestamptz,
      finished_at timestamptz,
      version integer not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table production_orders (
      id uuid primary key,
      status text not null,
      version integer not null default 1,
      updated_at timestamptz not null default now()
    );
    create table production_batch_orders (
      location_id text not null,
      production_batch_id uuid not null references production_batches(id) on delete cascade,
      production_order_id uuid not null,
      active boolean not null default true,
      primary key (production_batch_id, production_order_id)
    );
    create table stage_runs (
      id uuid primary key,
      production_batch_id uuid not null references production_batches(id) on delete cascade,
      status text not null default 'planned',
      actual_start_at timestamptz,
      actual_end_at timestamptz,
      started_by uuid,
      completed_by uuid,
      created_at timestamptz not null default now()
    );
    create table stage_machine_assignments (
      id uuid primary key,
      stage_run_id uuid not null references stage_runs(id) on delete cascade,
      status text not null default 'planned',
      actual_start_at timestamptz,
      actual_end_at timestamptz
    );
    create table work_events (
      id uuid primary key,
      event_type text not null,
      entity_type text not null,
      entity_id uuid not null,
      actor_id uuid not null,
      payload_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  return schema;
};

const seedLegacyPlannedRun = async (): Promise<void> => {
  await db.unsafe(`
    insert into scheduler_configs (
      id, location_id, pulse_minutes, fold_lbs_per_folder_minute,
      algorithm_version, version, stage_fit_assertion, asserted_by
    ) values (
      '${ids.config}', 'location-1', 56, 2, 'fixed-pulse-ffd-v1', 1,
      '{"sortingFits":true,"washingFits":true,"dryingFits":true}',
      '${ids.actor}'
    );
    insert into schedule_runs (
      id, location_id, production_shift_id, scheduler_config_id, status,
      input_snapshot, input_snapshot_hash, output_plan, output_plan_hash,
      algorithm_version, pulse_capacity_lbs, batch_count, makespan_minutes,
      planned_completion_at, accepted_at
    ) values (
      '${ids.schedule}', 'location-1', '${ids.shift}', '${ids.config}',
      'accepted', '{}', 'input-one', '{}', 'output-one',
      'fixed-pulse-ffd-v1', 224, 1, 224, '2026-07-10T18:00:00Z',
      '2026-07-10T14:00:00Z'
    );
    insert into production_runs (
      id, location_id, production_shift_id, schedule_run_id
    ) values (
      '${ids.run}', 'location-1', '${ids.shift}', '${ids.schedule}'
    );
    insert into production_batches (
      id, location_id, production_run_id, sequence_index, pulse_capacity_lbs,
      derived_weight_lbs, pulse_minutes, planned_done_at
    ) values (
      '${ids.batch}', 'location-1', '${ids.run}', 0, 224, 80, 56,
      '2026-07-10T18:00:00Z'
    );
    insert into production_orders (id, status)
      values ('${ids.order}', 'scheduled');
    insert into production_batch_orders (
      location_id, production_batch_id, production_order_id
    ) values ('location-1', '${ids.batch}', '${ids.order}');
    insert into stage_runs (id, production_batch_id)
      values ('${ids.stage}', '${ids.batch}');
    insert into stage_machine_assignments (id, stage_run_id)
      values ('${ids.assignment}', '${ids.stage}');
    insert into work_events (
      id, event_type, entity_type, entity_id, actor_id, payload_json
    ) values (
      '${ids.event}', 'schedule_accepted', 'production_run', '${ids.run}',
      '${ids.actor}',
      '{"_idempotency":{"version":1,"command":{"payload":{"acknowledgedWarningCodes":["SHIFT_OVERFLOW"]}},"result":{"productionRunId":"${ids.run}","productionBatchIds":["${ids.batch}"],"replayed":false}}}'
    );
  `);
};

const makeLegacyRunStarted = async (): Promise<void> => {
  await db.unsafe(`
    update production_runs
    set status = 'started', started_at = '2026-07-10T15:00:00Z'
    where id = '${ids.run}';
    update production_batches
    set status = 'sorting', started_at = '2026-07-10T15:00:00Z'
    where id = '${ids.batch}';
    update stage_runs
    set
      status = 'started',
      actual_start_at = '2026-07-10T15:00:00Z',
      started_by = '${ids.actor}'
    where id = '${ids.stage}';
    update stage_machine_assignments
    set status = 'active', actual_start_at = '2026-07-10T15:00:00Z'
    where id = '${ids.assignment}';
  `);
};

const dropLegacySchema = async (schema: string): Promise<void> => {
  await db.unsafe('set search_path to public');
  await db.unsafe(`drop schema if exists "${schema}" cascade`);
};

afterAll(async () => {
  await db.end();
});

describe.sequential('LPMS run-centered migration', () => {
  it('restores a legacy planned run to an accepted plan and eligible work', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyPlannedRun();
      await db.unsafe(migration);

      const [result] = await db.unsafe<
        {
          runs: number;
          batches: number;
          order_status: string;
          order_version: number;
          accepted_by: string;
          warning_codes: string[];
          acceptance_result: {
            scheduleRunId: string;
            productionShiftId: string;
            acceptedAt: string;
            replayed: boolean;
          };
          acceptance_entity_type: string;
          acceptance_entity_id: string;
          v2_configs: number;
        }[]
      >(`
        select
          (select count(*)::int from production_runs) as runs,
          (select count(*)::int from production_batches) as batches,
          (select status from production_orders where id = '${ids.order}') as order_status,
          (select version from production_orders where id = '${ids.order}') as order_version,
          (select accepted_by::text from schedule_runs where id = '${ids.schedule}') as accepted_by,
          (select acknowledged_warning_codes from schedule_runs where id = '${ids.schedule}') as warning_codes,
          (select payload_json #> '{_idempotency,result}' from work_events where id = '${ids.event}') as acceptance_result,
          (select entity_type from work_events where id = '${ids.event}') as acceptance_entity_type,
          (select entity_id::text from work_events where id = '${ids.event}') as acceptance_entity_id,
          (select count(*)::int from scheduler_configs where algorithm_version = 'fixed-pulse-ffd-v2') as v2_configs
      `);

      expect(result).toEqual({
        runs: 0,
        batches: 0,
        order_status: 'eligible',
        order_version: 2,
        accepted_by: ids.actor,
        warning_codes: ['SHIFT_OVERFLOW'],
        acceptance_result: {
          scheduleRunId: ids.schedule,
          productionShiftId: ids.shift,
          acceptedAt: '2026-07-10T14:00:00.000Z',
          replayed: false,
        },
        acceptance_entity_type: 'schedule_run',
        acceptance_entity_id: ids.schedule,
        v2_configs: 1,
      });
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it('aborts before mutation when a shift already has multiple runs', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyPlannedRun();
      await db.unsafe(`
        insert into schedule_runs (
          id, location_id, production_shift_id, scheduler_config_id, status,
          input_snapshot, input_snapshot_hash, output_plan, output_plan_hash,
          algorithm_version, pulse_capacity_lbs, batch_count,
          makespan_minutes, planned_completion_at
        ) values (
          '${ids.scheduleTwo}', 'location-1', '${ids.shift}', '${ids.config}',
          'superseded', '{}', 'input-two', '{}', 'output-two',
          'fixed-pulse-ffd-v1', 224, 0, 0, '2026-07-10T18:00:00Z'
        );
        insert into production_runs (
          id, location_id, production_shift_id, schedule_run_id
        ) values (
          '${ids.runTwo}', 'location-1', '${ids.shift}', '${ids.scheduleTwo}'
        );
      `);

      await expect(db.unsafe(migration)).rejects.toThrow(
        /LPMS_RUN_CENTERED_MIGRATION_MULTIPLE_RUNS_PER_SHIFT/,
      );
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it('aborts when a planned run contains started physical execution', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyPlannedRun();
      await db.unsafe(`
        update stage_runs
        set status = 'started', actual_start_at = '2026-07-10T15:00:00Z'
        where id = '${ids.stage}'
      `);

      await expect(db.unsafe(migration)).rejects.toThrow(
        /LPMS_RUN_CENTERED_MIGRATION_INCONSISTENT_EXECUTION/,
      );
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it('preserves a consistent started execution graph', async () => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyPlannedRun();
      await makeLegacyRunStarted();
      await db.unsafe(migration);

      const [stored] = await db.unsafe<
        {
          run_status: string;
          batch_status: string;
          membership_frozen_by: string;
        }[]
      >(`
        select
          run.status as run_status,
          batch.status as batch_status,
          batch.membership_frozen_by::text as membership_frozen_by
        from production_runs as run
        join production_batches as batch
          on batch.production_run_id = run.id
        where run.id = '${ids.run}'
      `);

      expect(stored).toEqual({
        run_status: 'started',
        batch_status: 'sorting',
        membership_frozen_by: ids.actor,
      });
    } finally {
      await dropLegacySchema(schema);
    }
  });

  it.each([
    {
      name: 'started batch timestamps',
      corrupt: `
        update production_batches
        set started_at = null
        where id = '${ids.batch}'
      `,
    },
    {
      name: 'started stage timestamps',
      corrupt: `
        update stage_runs
        set actual_start_at = null
        where id = '${ids.stage}'
      `,
    },
    {
      name: 'stage-machine assignment state',
      corrupt: `
        update stage_machine_assignments
        set status = 'planned', actual_start_at = null
        where id = '${ids.assignment}'
      `,
    },
  ])('aborts before mutation for inconsistent $name', async ({ corrupt }) => {
    const schema = await createLegacySchema();
    try {
      await seedLegacyPlannedRun();
      await makeLegacyRunStarted();
      await db.unsafe(corrupt);

      await expect(db.unsafe(migration)).rejects.toThrow(
        /LPMS_RUN_CENTERED_MIGRATION_INCONSISTENT_EXECUTION/,
      );

      const mutationCheck = await db.unsafe<{ has_new_column: boolean }[]>(`
        select exists (
          select 1
          from information_schema.columns
          where table_schema = '${schema}'
            and table_name = 'schedule_runs'
            and column_name = 'accepted_by'
        ) as has_new_column
      `);
      expect(mutationCheck[0]?.has_new_column).toBe(false);
    } finally {
      await dropLegacySchema(schema);
    }
  });
});
