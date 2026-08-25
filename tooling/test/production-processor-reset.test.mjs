import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const resetPath = resolve(
  root,
  'deploy/aws/lightsail/reset-processor-operational-data.sql',
);
const resetSql = readFileSync(resetPath, 'utf8');

const operationalTables = [
  'order_source_proposal_transitions',
  'order_source_terminal_tombstones',
  'order_source_proposal_resolutions',
  'order_source_proposals',
  'stage_machine_assignments',
  'production_order_stage_attempts',
  'production_batch_orders',
  'stage_runs',
  'production_batches',
  'production_runs',
  'schedule_runs',
  'production_shift_selected_orders',
  'production_shift_selections',
  'production_bags',
  'production_orders',
  'order_demands',
  'production_shifts',
  'order_outbox_events',
  'order_command_receipts',
  'order_source_snapshots',
  'order_source_customer_refs',
  'order_source_links',
  'order_items',
  'order_fulfillments',
  'orders',
];

const resetRelations = resetSql
  .match(/TRUNCATE TABLE(?<relations>[\s\S]+?)RESTART IDENTITY;/)
  ?.groups?.relations.split(',')
  .map((relation) => relation.trim());

describe('production Processor operational reset', () => {
  it('requires production identity, migration authority, release, and backup proof', () => {
    for (const guard of [
      '\\set ON_ERROR_STOP on',
      "current_setting('pressly.environment', true)",
      'production_processor_reset',
      "current_database() = 'pressly'",
      "current_user = 'pressly_migration'",
      'processor-production-clean-slate-v1',
      ":'release_sha' ~ '^[a-f0-9]{40}$'",
      ":'backup_sha256' ~ '^[a-f0-9]{64}$'",
      "WHERE id = 'pressly-one'",
      'AND is_active = true',
      "usename = 'pressly_runtime'",
      'production runtime sessions remain',
    ])
      expect(resetSql).toContain(guard);
  });

  it('locks ingestion and refuses to erase while a webhook can still run', () => {
    expect(resetSql).toContain(
      "hashtextextended('pressly:production-processor-clean-slate:v1', 0)",
    );
    expect(resetSql).toContain('LOCK TABLE webhook_events IN SHARE MODE;');
    expect(resetSql).toContain("WHERE status IN ('pending', 'processing')");
    expect(resetSql).toContain('PRODUCTION_PROCESSOR_RESET_WEBHOOKS_CLAIMABLE');
  });

  it('clears the exact operational graph without schema mutation', () => {
    expect(resetRelations).toEqual(operationalTables);
    expect(resetSql).toContain('BEGIN;');
    expect(resetSql).toContain('COMMIT;');
    expect(resetSql).not.toMatch(/\bCASCADE\b/i);
    expect(resetSql).not.toMatch(/\b(?:DROP|ALTER)\s+(?:TABLE|SCHEMA)\b/i);
  });

  it('preserves configuration, authority policy, and webhook evidence', () => {
    for (const preservedTable of [
      'production_locations',
      'production_stations',
      'production_machines',
      'scheduler_configs',
      'source_location_bindings',
      'webhook_events',
    ])
      expect(resetRelations).not.toContain(preservedTable);

    expect(resetSql).toContain('processed_webhook_events_preserved');
    expect(resetSql).toContain('dead_webhook_events_preserved');
  });

  it('asserts that no order or run operational record remains', () => {
    for (const relation of operationalTables)
      expect(resetSql).toContain(`(SELECT count(*) FROM ${relation})`);

    expect(resetSql).toContain('PRODUCTION_PROCESSOR_RESET_INCOMPLETE');
    expect(resetSql).toContain(
      "WHERE entity_type IN (\n        'order_demand',",
    );
  });
});
