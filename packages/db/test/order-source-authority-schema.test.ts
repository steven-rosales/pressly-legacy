import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig } from '../src/query.ts';
import * as orders from '../src/schema/orders.schema.ts';

const checkNames = (table: Parameters<typeof getTableConfig>[0]): string[] =>
  getTableConfig(table).checks.map((candidate) => candidate.name);

describe('Order source authority evidence retirement', () => {
  it('keeps retired source-authority storage out of the current schema', () => {
    expect('orderFieldAuthorities' in orders).toBe(false);
    expect('orderSourceCapabilityProfiles' in orders).toBe(false);
    expect('orderSourceControlRevisions' in orders).toBe(false);
    expect('orderSourceObservationDecisions' in orders).toBe(false);
    expect(
      getTableConfig(orders.orderSourceLinks).indexes.find(
        (candidate) =>
          candidate.config.name === 'order_source_links_id_identity_unique',
      )?.config.unique,
    ).toBe(true);
  });

  it('removes the retired tables, their trigger function, and the legacy demand field in dependency order', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0039_fantastic_energizer.sql',
        import.meta.url,
      ),
      'utf8',
    );

    const observationDrop = migration.indexOf(
      'DROP TABLE "order_source_observation_decisions"',
    );
    const controlDrop = migration.indexOf(
      'DROP TABLE "order_source_control_revisions"',
    );
    const profileDrop = migration.indexOf(
      'DROP TABLE "order_source_capability_profiles"',
    );
    expect(observationDrop).toBeGreaterThanOrEqual(0);
    expect(controlDrop).toBeGreaterThan(observationDrop);
    expect(profileDrop).toBeGreaterThan(controlDrop);
    expect(migration).toContain('DROP TABLE "order_field_authorities"');
    expect(migration).toContain(
      'DROP FUNCTION "reject_order_source_authority_evidence_mutation"()',
    );
    expect(migration).toContain(
      'ALTER TABLE "order_demands" DROP COLUMN "source_status_code"',
    );
    expect(migration).not.toMatch(/\bCASCADE\b/i);
  });

  it('extends command receipts with optional, coherent human-readable reasons', () => {
    expect(orders.orderCommandReceipts.reasonCode.name).toBe('reason_code');
    expect(orders.orderCommandReceipts.reasonCode.notNull).toBe(false);
    expect(orders.orderCommandReceipts.reasonNote.name).toBe('reason_note');
    expect(checkNames(orders.orderCommandReceipts)).toContain(
      'order_command_receipts_reason_consistent',
    );
  });

  it('keeps the migration additive, fail-closed, and append-only', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0035_order-source-authority-evidence.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain(
      'CREATE TABLE "order_source_capability_profiles"',
    );
    expect(migration).toContain(
      'CREATE TABLE "order_source_control_revisions"',
    );
    expect(migration).toContain(
      'CREATE TABLE "order_source_observation_decisions"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_capability_profiles_append_only"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_control_revisions_append_only"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_observation_decisions_append_only"',
    );
    expect(migration).toContain(
      'ALTER TABLE "order_command_receipts" ADD COLUMN "reason_code" text',
    );
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[a-z_]+"?\s+SET\b/i);
    expect(migration).not.toMatch(/\bDEFAULT\s+'normal'\b/i);
    expect(migration).not.toContain('source_location_bindings');
    expect(migration).not.toContain('production_locations');
  });
});
