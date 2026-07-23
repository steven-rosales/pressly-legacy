import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for cleanup migration tests.`);
};

const db = postgres(requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL'), {
  max: 1,
});

const migration = await readFile(
  new URL(
    '../src/migrations/0030_prelaunch-cents-order-cleanup.sql',
    import.meta.url,
  ),
  'utf8',
);

const ids = {
  user: '10000000-0000-4000-8000-000000000001',
  oldCentsOrder: '20000000-0000-4000-8000-000000000001',
  cutoffCentsOrder: '20000000-0000-4000-8000-000000000002',
  sharedOrder: '20000000-0000-4000-8000-000000000003',
  manualOrder: '20000000-0000-4000-8000-000000000004',
  oldCentsLink: '30000000-0000-4000-8000-000000000001',
  cutoffCentsLink: '30000000-0000-4000-8000-000000000002',
  sharedCentsLink: '30000000-0000-4000-8000-000000000003',
  sharedPresslyLink: '30000000-0000-4000-8000-000000000004',
} as const;

const createFixtureSchema = async (): Promise<string> => {
  const schema = `prelaunch_cents_cleanup_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table users (
      id uuid primary key
    );
    create table orders (
      id uuid primary key,
      customer_user_id uuid references users (id)
    );
    create table order_source_links (
      id uuid primary key,
      source text not null,
      external_order_id text not null,
      order_id uuid not null references orders (id),
      created_at timestamptz not null
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
      order_id uuid not null references orders (id) on delete cascade,
      field_name text not null,
      primary key (order_id, field_name)
    );
    create table order_command_receipts (
      idempotency_key text primary key,
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
    create table production_shift_selected_orders (
      production_shift_id uuid not null,
      production_order_id uuid not null references production_orders (id),
      primary key (production_shift_id, production_order_id)
    );
    create table production_batch_orders (
      production_batch_id uuid not null,
      production_order_id uuid not null references production_orders (id),
      primary key (production_batch_id, production_order_id)
    );
    create table production_order_stage_attempts (
      id uuid primary key,
      production_order_id uuid not null references production_orders (id)
    );
    create table work_events (
      id uuid primary key,
      entity_type text not null,
      entity_id uuid not null
    );
    create table webhook_events (
      id uuid primary key,
      source text not null,
      subject_id text,
      received_at timestamptz not null
    );
  `);

  await db.unsafe(`
    insert into users (id) values ('${ids.user}');

    insert into orders (id, customer_user_id) values
      ('${ids.oldCentsOrder}', '${ids.user}'),
      ('${ids.cutoffCentsOrder}', '${ids.user}'),
      ('${ids.sharedOrder}', '${ids.user}'),
      ('${ids.manualOrder}', '${ids.user}');

    insert into order_source_links (
      id, source, external_order_id, order_id, created_at
    ) values
      (
        '${ids.oldCentsLink}',
        'cents',
        'old-cents',
        '${ids.oldCentsOrder}',
        '2026-07-23T03:59:59Z'
      ),
      (
        '${ids.cutoffCentsLink}',
        'cents',
        'cutoff-cents',
        '${ids.cutoffCentsOrder}',
        '2026-07-23T04:00:00Z'
      ),
      (
        '${ids.sharedCentsLink}',
        'cents',
        'shared-cents',
        '${ids.sharedOrder}',
        '2026-07-22T12:00:00Z'
      ),
      (
        '${ids.sharedPresslyLink}',
        'pressly',
        'shared-pressly',
        '${ids.sharedOrder}',
        '2026-07-22T12:00:00Z'
      );

    insert into order_source_snapshots (source_link_id)
    select id from order_source_links;
    insert into order_source_customer_refs (order_source_link_id)
    select id from order_source_links;

    insert into order_items (id, order_id)
    select gen_random_uuid(), id from orders;
    insert into order_field_authorities (order_id, field_name)
    select id, 'displayNumber' from orders;
    insert into order_command_receipts (idempotency_key, order_id)
    select 'command:' || id::text, id from orders;

    insert into order_fulfillments (id, order_id)
    select
      ('40000000-0000-4000-8000-' || right(id::text, 12))::uuid,
      id
    from orders;
    insert into order_outbox_events (id, order_id, fulfillment_id)
    select gen_random_uuid(), order_id, id from order_fulfillments;
    insert into order_demands (id, fulfillment_id)
    select
      ('50000000-0000-4000-8000-' || right(id::text, 12))::uuid,
      id
    from order_fulfillments;
    insert into production_orders (id, order_demand_id)
    select
      ('60000000-0000-4000-8000-' || right(id::text, 12))::uuid,
      id
    from order_demands;
    insert into production_bags (id, production_order_id)
    select gen_random_uuid(), id from production_orders;
    insert into production_shift_selected_orders (
      production_shift_id, production_order_id
    )
    select '70000000-0000-4000-8000-000000000001', id
    from production_orders;
    insert into production_batch_orders (
      production_batch_id, production_order_id
    )
    select '80000000-0000-4000-8000-000000000001', id
    from production_orders;
    insert into production_order_stage_attempts (id, production_order_id)
    select gen_random_uuid(), id from production_orders;
    insert into work_events (id, entity_type, entity_id)
    select gen_random_uuid(), 'production_order', id from production_orders
    union all
    select gen_random_uuid(), 'order_demand', id from order_demands;

    insert into webhook_events (
      id, source, subject_id, received_at
    ) values (
      '90000000-0000-4000-8000-000000000001',
      'cents',
      'old-cents',
      '2026-07-23T03:59:59Z'
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

describe.sequential('prelaunch Cents order cleanup migration', () => {
  it('removes only pre-cutoff Cents-owned order aggregates and is idempotent', async () => {
    const schema = await createFixtureSchema();
    try {
      await db.unsafe(migration);
      await db.unsafe(migration);

      const [counts] = await db.unsafe<
        {
          orders: number;
          users: number;
          source_links: number;
          fulfillments: number;
          demands: number;
          production_orders: number;
          selected_orders: number;
          batch_orders: number;
          attempts: number;
          work_events: number;
          webhook_events: number;
        }[]
      >(`
        select
          (select count(*)::integer from orders) as orders,
          (select count(*)::integer from users) as users,
          (select count(*)::integer from order_source_links) as source_links,
          (select count(*)::integer from order_fulfillments) as fulfillments,
          (select count(*)::integer from order_demands) as demands,
          (select count(*)::integer from production_orders) as production_orders,
          (
            select count(*)::integer
            from production_shift_selected_orders
          ) as selected_orders,
          (
            select count(*)::integer
            from production_batch_orders
          ) as batch_orders,
          (
            select count(*)::integer
            from production_order_stage_attempts
          ) as attempts,
          (select count(*)::integer from work_events) as work_events,
          (select count(*)::integer from webhook_events) as webhook_events
      `);

      expect(counts).toEqual({
        orders: 3,
        users: 1,
        source_links: 3,
        fulfillments: 3,
        demands: 3,
        production_orders: 3,
        selected_orders: 3,
        batch_orders: 3,
        attempts: 3,
        work_events: 6,
        webhook_events: 1,
      });

      const remainingOrders = await db.unsafe<{ id: string }[]>(`
        select id::text
        from orders
        order by id
      `);
      expect(remainingOrders.map(({ id }) => id)).toEqual([
        ids.cutoffCentsOrder,
        ids.sharedOrder,
        ids.manualOrder,
      ]);

      const [targetResidue] = await db.unsafe<{ residue: number }[]>(`
        select (
          (select count(*) from orders
            where id = '${ids.oldCentsOrder}')
          + (select count(*) from order_source_links
            where order_id = '${ids.oldCentsOrder}')
          + (select count(*) from order_items
            where order_id = '${ids.oldCentsOrder}')
          + (select count(*) from order_field_authorities
            where order_id = '${ids.oldCentsOrder}')
          + (select count(*) from order_command_receipts
            where order_id = '${ids.oldCentsOrder}')
        )::integer as residue
      `);
      expect(targetResidue?.residue).toBe(0);
    } finally {
      await dropFixtureSchema(schema);
    }
  });
});
