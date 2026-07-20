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
    '../src/migrations/0021_lpms-demand-lifecycle-outlook.sql',
    import.meta.url,
  ),
  'utf8',
);

const createLegacySchema = async (): Promise<string> => {
  const schema = `lpms_demand_lifecycle_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table order_demands (
      id uuid primary key,
      demand_key text not null,
      location_id text not null,
      status text not null
    );
    create index order_demands_location_status_idx
      on order_demands (location_id, status);
    create table production_orders (
      id uuid primary key,
      order_demand_id uuid not null,
      derived_weight_lbs numeric(12, 3) not null,
      derived_weight_source text not null,
      eligible_at timestamptz not null
    );
    create table webhook_events (
      id uuid primary key,
      source text not null,
      event_type text not null,
      subject_type text not null,
      subject_id text,
      source_occurred_at timestamptz,
      payload_json jsonb,
      status text not null,
      received_at timestamptz not null
    );
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

describe.sequential('LPMS demand lifecycle migration', () => {
  it('recovers the latest canonical Cents status and weight before enforcing constraints', async () => {
    const schema = await createLegacySchema();
    try {
      await db.unsafe(`
        insert into order_demands (id, demand_key, location_id, status) values
          ('00000000-0000-4000-8000-000000000001', 'cents:order:7486543', 'location-1', 'not_ready'),
          ('00000000-0000-4000-8000-000000000002', 'legacy:order:2', 'location-1', 'not_ready'),
          ('00000000-0000-4000-8000-000000000003', 'legacy:order:3', 'location-1', 'ready_for_production');
        insert into production_orders (
          id, order_demand_id, derived_weight_lbs, derived_weight_source,
          eligible_at
        ) values (
          '00000000-0000-4000-8000-000000000004',
          '00000000-0000-4000-8000-000000000003',
          52.500,
          'external_estimate',
          '2026-07-19T13:00:00Z'
        );
        insert into webhook_events (
          id, source, event_type, subject_type, subject_id,
          source_occurred_at, payload_json, status, received_at
        ) values
          (
            '00000000-0000-4000-8000-000000000005',
            'cents', 'order_created', 'order', '7486543',
            '2026-07-19T13:32:00Z',
            '{"status":"SUBMITTED","services":[{"totalPriceCents":0,"unitPriceCents":167}]}'::jsonb,
            'processed', '2026-07-19T13:32:01Z'
          ),
          (
            '00000000-0000-4000-8000-000000000006',
            'cents', 'order_updated', 'order', '7486543',
            '2026-07-19T13:33:13.156Z',
            '{"status":"SUBMITTED","services":[{"totalPriceCents":3000,"unitPriceCents":167}]}'::jsonb,
            'processed', '2026-07-19T13:33:18Z'
          );
      `);

      await db.unsafe(migration);

      const rows = await db.unsafe<
        {
          demand_key: string;
          phase: string;
          source_status_code: string;
          estimated_weight_lbs: string | null;
          estimated_weight_source: string | null;
        }[]
      >(`
        select demand_key, phase, source_status_code,
               estimated_weight_lbs::text, estimated_weight_source
        from order_demands
        order by demand_key
      `);

      expect(rows).toEqual([
        {
          demand_key: 'cents:order:7486543',
          phase: 'expected',
          source_status_code: 'SUBMITTED',
          estimated_weight_lbs: '17.964',
          estimated_weight_source: 'external_estimate',
        },
        {
          demand_key: 'legacy:order:2',
          phase: 'expected',
          source_status_code: 'LEGACY_UNKNOWN',
          estimated_weight_lbs: null,
          estimated_weight_source: null,
        },
        {
          demand_key: 'legacy:order:3',
          phase: 'production_released',
          source_status_code: 'LEGACY_IN_PROGRESS',
          estimated_weight_lbs: '52.500',
          estimated_weight_source: 'external_estimate',
        },
      ]);
    } finally {
      await dropLegacySchema(schema);
    }
  });
});
