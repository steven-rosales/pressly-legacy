import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig, getTableName, orders } from '../src/index.ts';

const checkNames = (table: Parameters<typeof getTableConfig>[0]): string[] =>
  getTableConfig(table).checks.map((candidate) => candidate.name);

describe('Order source authority evidence schema', () => {
  it('exports the three bounded, versioned evidence tables', () => {
    expect(getTableName(orders.orderSourceCapabilityProfiles)).toBe(
      'order_source_capability_profiles',
    );
    expect(getTableName(orders.orderSourceControlRevisions)).toBe(
      'order_source_control_revisions',
    );
    expect(getTableName(orders.orderSourceObservationDecisions)).toBe(
      'order_source_observation_decisions',
    );
  });

  it('binds immutable profiles, graph-valid posture revisions, and exact observations', () => {
    expect(checkNames(orders.orderSourceCapabilityProfiles)).toEqual(
      expect.arrayContaining([
        'order_source_capability_profiles_definition_object',
        'order_source_capability_profiles_hash_shape',
        'order_source_capability_profiles_context_present',
      ]),
    );
    expect(checkNames(orders.orderSourceControlRevisions)).toEqual(
      expect.arrayContaining([
        'order_source_control_revisions_positive_version',
        'order_source_control_revisions_initialization_consistent',
        'order_source_control_revisions_transition_consistent',
        'order_source_control_revisions_context_present',
      ]),
    );
    expect(checkNames(orders.orderSourceObservationDecisions)).toEqual(
      expect.arrayContaining([
        'order_source_observation_decisions_configuration_consistent',
        'order_source_observation_decisions_unconfigured_denied',
        'order_source_observation_decisions_evidence_arrays',
        'order_source_observation_decisions_effect_consistent',
        'order_source_observation_decisions_shadow_has_no_effect',
        'order_source_observation_decisions_nonnewer_has_no_effect',
      ]),
    );

    const observationConfig = getTableConfig(
      orders.orderSourceObservationDecisions,
    );
    expect(
      observationConfig.foreignKeys.map((candidate) => candidate.getName()),
    ).toEqual(
      expect.arrayContaining([
        'order_source_observation_decisions_source_link_fk',
        'order_source_observation_decisions_profile_fk',
        'order_source_observation_decisions_control_fk',
      ]),
    );
    expect(orders.orderSourceObservationDecisions.profileVersion.notNull).toBe(
      false,
    );
    expect(orders.orderSourceObservationDecisions.controlVersion.notNull).toBe(
      false,
    );
    expect(
      getTableConfig(orders.orderSourceLinks).indexes.find(
        (candidate) =>
          candidate.config.name === 'order_source_links_id_identity_unique',
      )?.config.unique,
    ).toBe(true);
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
