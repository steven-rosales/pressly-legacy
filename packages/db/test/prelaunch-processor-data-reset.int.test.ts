import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for reset migration tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const migration = await readFile(
  new URL(
    '../src/migrations/0034_prelaunch-processor-data-reset.sql',
    import.meta.url,
  ),
  'utf8',
);

const removedTables = [
  'orders',
  'order_source_links',
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_items',
  'order_field_authorities',
  'order_command_receipts',
  'order_fulfillments',
  'order_outbox_events',
  'order_demands',
  'production_orders',
  'production_bags',
  'production_shift_selected_orders',
  'production_shift_selections',
  'production_order_stage_attempts',
  'production_batch_orders',
  'stage_machine_assignments',
  'stage_runs',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shifts',
] as const;

const createFixtureSchema = async (): Promise<string> => {
  const schema = `prelaunch_processor_reset_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);

  await db.unsafe(`
    create table users (id uuid primary key);
    create table webhook_events (id uuid primary key);
    create table production_locations (
      id uuid primary key,
      live_revision bigint not null
    );
    create table production_stations (
      id uuid primary key,
      location_id uuid not null references production_locations (id)
    );
    create table production_machines (
      id uuid primary key,
      station_id uuid not null references production_stations (id)
    );
    create table scheduler_configs (
      id uuid primary key,
      location_id uuid not null references production_locations (id)
    );

    create table orders (id uuid primary key);
    create table order_source_links (
      id uuid primary key,
      order_id uuid not null references orders (id)
    );
    create table order_source_snapshots (
      source_link_id uuid primary key
        references order_source_links (id) on delete cascade
    );
    create table order_source_customer_refs (
      order_source_link_id uuid primary key
        references order_source_links (id) on delete cascade
    );
    create table order_items (
      id uuid primary key,
      order_id uuid not null references orders (id) on delete cascade
    );
    create table order_field_authorities (
      order_id uuid primary key
        references orders (id) on delete cascade
    );
    create table order_command_receipts (
      id uuid primary key,
      order_id uuid not null references orders (id)
    );
    create table order_fulfillments (
      id uuid primary key,
      order_id uuid not null references orders (id) on delete cascade
    );
    create table order_outbox_events (
      id uuid primary key,
      order_id uuid not null references orders (id),
      fulfillment_id uuid not null references order_fulfillments (id)
    );
    create table order_demands (
      id uuid primary key,
      fulfillment_id uuid not null references order_fulfillments (id)
    );
    create table production_orders (
      id uuid primary key,
      order_demand_id uuid not null references order_demands (id)
    );
    create table production_bags (
      id uuid primary key,
      production_order_id uuid not null
        references production_orders (id) on delete cascade
    );
    create table production_shifts (id uuid primary key);
    create table production_shift_selections (
      production_shift_id uuid primary key
        references production_shifts (id) on delete cascade
    );
    create table production_shift_selected_orders (
      production_shift_id uuid not null
        references production_shift_selections (production_shift_id)
        on delete cascade,
      production_order_id uuid not null references production_orders (id),
      primary key (production_shift_id, production_order_id)
    );
    create table schedule_runs (
      id uuid primary key,
      production_shift_id uuid not null references production_shifts (id),
      scheduler_config_id uuid not null references scheduler_configs (id)
    );
    create table production_runs (
      id uuid primary key,
      production_shift_id uuid not null references production_shifts (id),
      schedule_run_id uuid not null references schedule_runs (id)
    );
    create table production_batches (
      id uuid primary key,
      production_run_id uuid not null
        references production_runs (id) on delete cascade
    );
    create table stage_runs (
      id uuid primary key,
      production_batch_id uuid not null
        references production_batches (id) on delete cascade
    );
    create table production_batch_orders (
      id uuid primary key,
      production_batch_id uuid not null
        references production_batches (id) on delete cascade,
      production_order_id uuid not null references production_orders (id)
    );
    create table stage_machine_assignments (
      id uuid primary key,
      stage_run_id uuid not null references stage_runs (id) on delete cascade,
      machine_id uuid not null references production_machines (id)
    );
    create table production_order_stage_attempts (
      id uuid primary key,
      production_run_id uuid not null
        references production_runs (id) on delete cascade,
      production_order_id uuid not null references production_orders (id),
      stage_run_id uuid not null references stage_runs (id)
    );
    create table work_events (
      id uuid primary key,
      entity_type text not null,
      entity_id uuid not null
    );
  `);

  await db.unsafe(`
    insert into users values ('10000000-0000-4000-8000-000000000001');
    insert into webhook_events values ('11000000-0000-4000-8000-000000000001');
    insert into production_locations values (
      '12000000-0000-4000-8000-000000000001',
      19
    );
    insert into production_stations values (
      '13000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000001'
    );
    insert into production_machines values (
      '14000000-0000-4000-8000-000000000001',
      '13000000-0000-4000-8000-000000000001'
    );
    insert into scheduler_configs values (
      '15000000-0000-4000-8000-000000000001',
      '12000000-0000-4000-8000-000000000001'
    );

    insert into orders values ('20000000-0000-4000-8000-000000000001');
    insert into order_source_links values (
      '21000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    );
    insert into order_source_snapshots values (
      '21000000-0000-4000-8000-000000000001'
    );
    insert into order_source_customer_refs values (
      '21000000-0000-4000-8000-000000000001'
    );
    insert into order_items values (
      '22000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    );
    insert into order_field_authorities values (
      '20000000-0000-4000-8000-000000000001'
    );
    insert into order_command_receipts values (
      '23000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    );
    insert into order_fulfillments values (
      '24000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    );
    insert into order_outbox_events values (
      '25000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001'
    );
    insert into order_demands values (
      '26000000-0000-4000-8000-000000000001',
      '24000000-0000-4000-8000-000000000001'
    );
    insert into production_orders values (
      '27000000-0000-4000-8000-000000000001',
      '26000000-0000-4000-8000-000000000001'
    );
    insert into production_bags values (
      '28000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000001'
    );
    insert into production_shifts values (
      '30000000-0000-4000-8000-000000000001'
    );
    insert into production_shift_selections values (
      '30000000-0000-4000-8000-000000000001'
    );
    insert into production_shift_selected_orders values (
      '30000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000001'
    );
    insert into schedule_runs values (
      '31000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '15000000-0000-4000-8000-000000000001'
    );
    insert into production_runs values (
      '32000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000001'
    );
    insert into production_batches values (
      '33000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001'
    );
    insert into stage_runs values (
      '34000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001'
    );
    insert into production_batch_orders values (
      '35000000-0000-4000-8000-000000000001',
      '33000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000001'
    );
    insert into stage_machine_assignments values (
      '36000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001',
      '14000000-0000-4000-8000-000000000001'
    );
    insert into production_order_stage_attempts values (
      '37000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      '27000000-0000-4000-8000-000000000001',
      '34000000-0000-4000-8000-000000000001'
    );

    insert into work_events (id, entity_type, entity_id) values
      (
        '40000000-0000-4000-8000-000000000001',
        'production_order',
        '27000000-0000-4000-8000-000000000001'
      ),
      (
        '40000000-0000-4000-8000-000000000002',
        'production_run',
        '32000000-0000-4000-8000-000000000001'
      ),
      (
        '40000000-0000-4000-8000-000000000003',
        'production_resource_manifest',
        '12000000-0000-4000-8000-000000000001'
      ),
      (
        '40000000-0000-4000-8000-000000000004',
        'scheduler_config',
        '15000000-0000-4000-8000-000000000001'
      );
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

describe.sequential('prelaunch Processor data reset migration', () => {
  it('clears orders and execution once while preserving durable configuration', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);
      await db.unsafe(migration);

      const removedCounts = await Promise.all(
        removedTables.map(async (table) => {
          const [row] = await db.unsafe<{ count: number }[]>(
            `select count(*)::integer as count from ${table}`,
          );
          return [table, row?.count] as const;
        }),
      );
      expect(Object.fromEntries(removedCounts)).toEqual(
        Object.fromEntries(removedTables.map((table) => [table, 0])),
      );

      const [preserved] = await db.unsafe<
        {
          users: number;
          webhookEvents: number;
          locations: number;
          stations: number;
          machines: number;
          schedulerConfigs: number;
          workEvents: number;
          liveRevision: number;
        }[]
      >(`
        select
          (select count(*)::integer from users) as "users",
          (select count(*)::integer from webhook_events) as "webhookEvents",
          (select count(*)::integer from production_locations) as "locations",
          (select count(*)::integer from production_stations) as "stations",
          (select count(*)::integer from production_machines) as "machines",
          (select count(*)::integer from scheduler_configs) as "schedulerConfigs",
          (select count(*)::integer from work_events) as "workEvents",
          (
            select live_revision::integer
            from production_locations
            limit 1
          ) as "liveRevision"
      `);

      expect(preserved).toEqual({
        users: 1,
        webhookEvents: 1,
        locations: 1,
        stations: 1,
        machines: 1,
        schedulerConfigs: 1,
        workEvents: 2,
        liveRevision: 19,
      });

      const preservedEventTypes = await db.unsafe<{ entityType: string }[]>(`
        select entity_type as "entityType"
        from work_events
        order by entity_type
      `);
      expect(preservedEventTypes.map(({ entityType }) => entityType)).toEqual([
        'production_resource_manifest',
        'scheduler_config',
      ]);
    } finally {
      await dropFixtureSchema(schema);
    }
  });
});
