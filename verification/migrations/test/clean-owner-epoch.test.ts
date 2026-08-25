import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsDirectory = fileURLToPath(
  new URL('../../../platform/postgres/migrations/', import.meta.url),
);

const migrationFiles = (): readonly string[] =>
  readdirSync(migrationsDirectory)
    .filter((file) => /^[0-9]{4}_.+[.]sql$/u.test(file))
    .sort();

const readMigration = (file: string): string =>
  readFileSync(
    new URL(`../../../platform/postgres/migrations/${file}`, import.meta.url),
    'utf8',
  );

const baselineFile = '0000_clean_owner_schema.sql';
const mechanismsFile = '0001_owner_database_mechanisms.sql';

describe('clean owner database epoch', () => {
  it('contains exactly one clean schema baseline and one mechanisms migration', () => {
    expect(migrationFiles()).toEqual([baselineFile, mechanismsFile]);
  });

  it('keeps the baseline free of historical data rewrites and preserves Pricing DDL', () => {
    const baseline = readMigration(baselineFile);

    expect(baseline).not.toMatch(
      /\b(?:insert\s+into|update\s+[^\s]+\s+set|delete\s+from|truncate\s+table)\b/iu,
    );
    expect(baseline).not.toMatch(
      /\b(?:backfill|compatibility|legacy|prelaunch|repair)\b/iu,
    );

    for (const table of [
      'pricing_services',
      'pricing_sets',
      'pricing_items',
      'pricing_change_events',
    ])
      expect(baseline).toMatch(
        new RegExp(`create table ["']?${table}["']?`, 'iu'),
      );

    expect(baseline).toContain('pricing_sets_active_service_unique');
    expect(baseline).toContain('pricing_items_code_per_set_unique');
    for (const retiredTable of [
      'order_source_capability_profiles',
      'order_source_control_revisions',
      'order_source_observation_decisions',
    ])
      expect(baseline).not.toContain(retiredTable);
  });

  it('keeps database-only owner mechanisms in the second immutable entry', () => {
    const mechanisms = readMigration(mechanismsFile);

    expect(mechanisms).toMatch(/create extension[^;]+pgcrypto/iu);
    expect(mechanisms).toMatch(/create extension[^;]+btree_gist/iu);
    expect(mechanisms).toContain('stage_machine_assignments_no_overlap');

    expect(mechanisms).toContain('pressly_notify_production_change');
    expect(mechanisms).toContain('work_events_notify_production_change');
    expect(mechanisms).toContain('pressly_production_changes');
    expect(mechanisms).toMatch(
      /update\s+["']?production_locations["']?\s+set\s+["']?live_revision/iu,
    );
    expect(mechanisms).not.toMatch(
      /update\s+["']?access_production_locations["']?/iu,
    );

    for (const guard of [
      'order_source_proposals_snapshot_immutable',
      'order_source_proposal_resolutions_immutable',
      'order_source_proposal_transitions_immutable',
      'order_source_terminal_tombstones_immutable',
    ])
      expect(mechanisms).toContain(guard);
    for (const retiredGuard of [
      'order_source_capability_profiles_append_only',
      'order_source_control_revisions_append_only',
      'order_source_observation_decisions_append_only',
    ])
      expect(mechanisms).not.toContain(retiredGuard);

    for (const guard of [
      'workforce_invitations_lifecycle_guard',
      'workforce_memberships_lifecycle_guard',
      'auth_access_grants_lifecycle_guard',
      'auth_lifecycle_transitions_immutable',
      'auth_command_receipts_immutable',
      'auth_access_grants_last_owner_guard',
      'workforce_memberships_last_owner_guard',
      'auth_identities_last_owner_guard',
      'PRESSLY_LAST_OWNER_REQUIRED',
    ])
      expect(mechanisms).toContain(guard);
  });
});
