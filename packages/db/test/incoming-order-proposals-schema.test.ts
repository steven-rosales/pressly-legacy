import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getTableConfig, getTableName, orders } from '../src/index.ts';

const checkNames = (table: Parameters<typeof getTableConfig>[0]): string[] =>
  getTableConfig(table).checks.map((candidate) => candidate.name);

describe('incoming Order proposal persistence', () => {
  it('persists candidate state, graph transitions, decisions, and terminal tombstones', () => {
    expect(getTableName(orders.orderSourceProposals)).toBe(
      'order_source_proposals',
    );
    expect(getTableName(orders.orderSourceProposalResolutions)).toBe(
      'order_source_proposal_resolutions',
    );
    expect(getTableName(orders.orderSourceProposalTransitions)).toBe(
      'order_source_proposal_transitions',
    );
    expect(getTableName(orders.orderSourceTerminalTombstones)).toBe(
      'order_source_terminal_tombstones',
    );
    expect(orders.orderSourceProposals.proposalKind.name).toBe('proposal_kind');
    expect(checkNames(orders.orderSourceProposals)).toEqual(
      expect.arrayContaining([
        'order_source_proposals_kind_valid',
        'order_source_proposals_hash_shape',
        'order_source_proposals_snapshot_object',
        'order_source_proposals_state_valid',
        'order_source_proposals_positive_version',
      ]),
    );
    expect(checkNames(orders.orderSourceProposalResolutions)).toEqual(
      expect.arrayContaining([
        'order_source_proposal_resolutions_decision_valid',
        'order_source_proposal_resolutions_version_valid',
        'order_source_proposal_resolutions_effect_consistent',
      ]),
    );
    expect(checkNames(orders.orderSourceProposalTransitions)).toEqual(
      expect.arrayContaining([
        'order_source_proposal_transitions_states_valid',
        'order_source_proposal_transitions_event_valid',
        'order_source_proposal_transitions_edge_consistent',
        'order_source_proposal_transitions_version_valid',
        'order_source_proposal_transitions_terminal_consistent',
      ]),
    );
    expect(checkNames(orders.orderSourceTerminalTombstones)).toEqual(
      expect.arrayContaining([
        'order_source_terminal_tombstones_identity_present',
        'order_source_terminal_tombstones_code_valid',
        'order_source_terminal_tombstones_hash_shape',
        'order_source_terminal_tombstones_payload_object',
      ]),
    );
    expect(
      getTableConfig(orders.orderSourceProposals).indexes.find(
        (candidate) =>
          candidate.config.name ===
          'order_source_proposals_source_identity_unique',
      )?.config.unique,
    ).toBe(true);
    expect(
      getTableConfig(orders.orderSourceProposalTransitions).indexes.find(
        (candidate) =>
          candidate.config.name ===
          'order_source_proposal_transitions_version_unique',
      )?.config.unique,
    ).toBe(true);
    expect(
      getTableConfig(orders.orderSourceTerminalTombstones).indexes.find(
        (candidate) =>
          candidate.config.name ===
          'order_source_terminal_tombstones_identity_unique',
      )?.config.unique,
    ).toBe(true);
  });

  it('keeps the historical 0036 proposal baseline additive and append-only', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0036_incoming-order-proposals.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain('CREATE TABLE "order_source_proposals"');
    expect(migration).toContain(
      'CREATE TABLE "order_source_proposal_resolutions"',
    );
    expect(migration).toContain('"proposal_kind" text NOT NULL');
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_proposals_immutable"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_proposal_resolutions_immutable"',
    );
    expect(migration).not.toContain('PICKED_UP');
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bINSERT\s+INTO\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+"?[a-z_]+"?\s+SET\b/i);
  });

  it('migrates the proposal ledger to the submitted-candidate graph without deleting evidence', async () => {
    const migration = await readFile(
      new URL(
        '../src/migrations/0037_submitted_candidate_lifecycle.sql',
        import.meta.url,
      ),
      'utf8',
    );

    expect(migration).toContain(
      'CREATE TABLE "order_source_proposal_transitions"',
    );
    expect(migration).toContain(
      'CREATE TABLE "order_source_terminal_tombstones"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_proposals_snapshot_immutable"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_proposal_transitions_immutable"',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "order_source_terminal_tombstones_immutable"',
    );
    expect(migration).toContain(
      `("order_source_proposals"."proposal_kind" in ('pickup', 'submitted_order'))`,
    );
    expect(migration).toContain(
      `("order_source_proposals"."state" in ('pending', 'source_closed', 'restored_pending', 'accepted', 'rejected'))`,
    );
    expect(migration).toContain(`"event_type" text NOT NULL`);
    expect(migration).toContain(`"event_type" = 'source_close'`);
    expect(migration).toContain(`"from_state" = 'restored_pending'`);
    expect(migration).toMatch(
      /\bUPDATE\s+"order_source_proposals"\s+AS\s+proposal\b/i,
    );
    expect(migration).toMatch(
      /\bINSERT\s+INTO\s+"order_source_proposal_transitions"/i,
    );
    expect(migration).not.toMatch(/\bDROP\s+(?:TABLE|COLUMN)\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
  });
});
