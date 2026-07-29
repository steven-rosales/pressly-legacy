import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const requiredUrl = (name: string): string => {
  const value = process.env[name];
  if (value) return value;
  throw new Error(`${name} is required for source authority migration tests.`);
};

const migrationDatabaseUrl = requiredUrl('PRESSLY_TEST_MIGRATION_DATABASE_URL');
const db = postgres(migrationDatabaseUrl, { max: 1 });
const migration = await readFile(
  new URL(
    '../src/migrations/0035_order-source-authority-evidence.sql',
    import.meta.url,
  ),
  'utf8',
);

const sourceLinkId = '10000000-0000-4000-8000-000000000001';
const profileHash = 'a'.repeat(64);
const sourceRevisionHash = 'b'.repeat(64);

const createFixtureSchema = async (): Promise<string> => {
  const schema = `order_source_authority_${randomUUID().replaceAll('-', '')}`;
  await db.unsafe(`create schema "${schema}"`);
  await db.unsafe(`set search_path to "${schema}", public`);
  await db.unsafe(`
    create table orders (
      id uuid primary key
    );

    create table order_source_links (
      id uuid primary key,
      source text not null,
      external_order_id text not null
    );

    create table order_command_receipts (
      idempotency_key text primary key
    );

    insert into order_source_links (id, source, external_order_id)
    values ('${sourceLinkId}', 'cents', 'external-1');

    insert into order_command_receipts (idempotency_key)
    values ('legacy-receipt');
  `);
  await db.unsafe(migration.replaceAll('"public".', `"${schema}".`));
  return schema;
};

const dropFixtureSchema = async (schema: string): Promise<void> => {
  await db.unsafe('set search_path to public');
  await db.unsafe(`drop schema if exists "${schema}" cascade`);
};

const insertProfile = async (schema: string): Promise<void> => {
  await db.unsafe(`
    insert into "${schema}".order_source_capability_profiles (
      source,
      profile_version,
      policy_version,
      capability_definition_json,
      definition_hash,
      created_by_actor_kind,
      created_by_actor_id,
      reason_code
    ) values (
      'cents',
      'cents-order-claims-v1',
      'order-source-authority-v1',
      '{"creation":{"customer":"auto_adopt"}}'::jsonb,
      '${profileHash}',
      'human',
      'manager-1',
      'source_profile_established'
    )
  `);
};

const insertInitialControl = async (schema: string): Promise<void> => {
  await db.unsafe(`
    insert into "${schema}".order_source_control_revisions (
      source,
      location_id,
      version,
      profile_version,
      from_posture,
      posture,
      event_type,
      changed_by_actor_kind,
      changed_by_actor_id,
      reason_code
    ) values (
      'cents',
      'location-1',
      1,
      'cents-order-claims-v1',
      null,
      'normal',
      'initialize',
      'human',
      'manager-1',
      'source_control_initialized'
    )
  `);
};

const unconfiguredDecisionInsert = (
  schema: string,
  evaluationKey: string,
  externalOrderId: string,
  overallDisposition = 'deny',
  assuranceDemotion = 0,
): string => `
  insert into "${schema}".order_source_observation_decisions (
    evaluation_key,
    source,
    external_order_id,
    location_id,
    source_revision_at,
    source_revision_hash,
    adapter_version,
    configuration_status,
    policy_version,
    evaluation_mode,
    revision_classification,
    claim_phase,
    overall_disposition,
    assurance_demotion,
    claim_decisions_json,
    reason_codes_json,
    proposed_fields_json,
    adopted_fields_json,
    canonical_effect,
    observed_at
  ) values (
    '${evaluationKey}',
    'cents',
    '${externalOrderId}',
    'location-unconfigured',
    '2026-07-28T12:00:00Z',
    '${sourceRevisionHash}',
    'cents-adapter-v1',
    'unconfigured',
    'order-source-authority-v1',
    'enforced',
    'newer',
    'creation',
    '${overallDisposition}',
    ${assuranceDemotion},
    '[]'::jsonb,
    '["source_unconfigured"]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    'none',
    '2026-07-28T12:00:00Z'
  )
`;

afterAll(async () => {
  await db.end();
});

describe.sequential('Order source authority evidence migration', () => {
  it('preserves legacy receipts and accepts configured and fail-closed decisions', async () => {
    const schema = await createFixtureSchema();
    try {
      await insertProfile(schema);
      await insertInitialControl(schema);
      await db.unsafe(`
        insert into "${schema}".order_source_observation_decisions (
          evaluation_key,
          source_link_id,
          source,
          external_order_id,
          location_id,
          source_revision_at,
          source_revision_hash,
          adapter_version,
          source_lifecycle_code,
          configuration_status,
          profile_version,
          control_version,
          policy_version,
          evaluation_mode,
          revision_classification,
          claim_phase,
          overall_disposition,
          assurance_demotion,
          claim_decisions_json,
          reason_codes_json,
          proposed_fields_json,
          adopted_fields_json,
          canonical_effect,
          observed_at
        ) values (
          '${'c'.repeat(64)}',
          '${sourceLinkId}',
          'cents',
          'external-1',
          'location-1',
          '2026-07-28T12:00:00Z',
          '${sourceRevisionHash}',
          'cents-adapter-v1',
          'IN_PROGRESS',
          'configured',
          'cents-order-claims-v1',
          1,
          'order-source-authority-v1',
          'shadow',
          'newer',
          'creation',
          'observe',
          0,
          '[{"claim":"customer","disposition":"observe"}]'::jsonb,
          '["profile_ceiling"]'::jsonb,
          '["customer"]'::jsonb,
          '[]'::jsonb,
          'none',
          '2026-07-28T12:00:00Z'
        )
      `);
      await db.unsafe(
        unconfiguredDecisionInsert(
          schema,
          'd'.repeat(64),
          'external-unconfigured',
        ),
      );

      const [receipt] = await db.unsafe<
        { reason_code: string | null; reason_note: string | null }[]
      >(`
        select reason_code, reason_note
        from "${schema}".order_command_receipts
        where idempotency_key = 'legacy-receipt'
      `);
      expect(receipt).toEqual({ reason_code: null, reason_note: null });

      await db.unsafe(`
        update "${schema}".order_command_receipts
        set
          reason_code = 'follow_source_accepted',
          reason_note = 'Manager accepted the source proposal.'
        where idempotency_key = 'legacy-receipt'
      `);
    } finally {
      await dropFixtureSchema(schema);
    }
  });

  it('serializes concurrent posture revisions and observation decisions', async () => {
    const schema = await createFixtureSchema();
    const first = postgres(migrationDatabaseUrl, { max: 1 });
    const second = postgres(migrationDatabaseUrl, { max: 1 });
    try {
      await insertProfile(schema);
      await insertInitialControl(schema);

      const postureInsert = `
        insert into "${schema}".order_source_control_revisions (
          source,
          location_id,
          version,
          profile_version,
          from_posture,
          posture,
          event_type,
          changed_by_actor_kind,
          changed_by_actor_id,
          reason_code
        ) values (
          'cents',
          'location-1',
          2,
          'cents-order-claims-v1',
          'normal',
          'observe_only',
          'degrade_to_observe_only',
          'system',
          'source-assurance-monitor',
          'assurance_degraded'
        )
      `;
      const postureResults = await Promise.allSettled([
        first.unsafe(postureInsert),
        second.unsafe(postureInsert),
      ]);
      expect(
        postureResults.filter((candidate) => candidate.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        postureResults.filter((candidate) => candidate.status === 'rejected'),
      ).toHaveLength(1);

      const observationInsert = unconfiguredDecisionInsert(
        schema,
        'e'.repeat(64),
        'external-concurrent',
      );
      const observationResults = await Promise.allSettled([
        first.unsafe(observationInsert),
        second.unsafe(observationInsert),
      ]);
      expect(
        observationResults.filter(
          (candidate) => candidate.status === 'fulfilled',
        ),
      ).toHaveLength(1);
      expect(
        observationResults.filter(
          (candidate) => candidate.status === 'rejected',
        ),
      ).toHaveLength(1);
    } finally {
      await Promise.all([first.end(), second.end()]);
      await dropFixtureSchema(schema);
    }
  });

  it('rejects invalid bindings and mutations of append-only evidence', async () => {
    const schema = await createFixtureSchema();
    try {
      await insertProfile(schema);
      await insertInitialControl(schema);
      await db.unsafe(
        unconfiguredDecisionInsert(
          schema,
          'f'.repeat(64),
          'external-append-only',
        ),
      );

      await expect(
        db.unsafe(`
          insert into "${schema}".order_source_control_revisions (
            source,
            location_id,
            version,
            profile_version,
            from_posture,
            posture,
            event_type,
            changed_by_actor_kind,
            changed_by_actor_id,
            reason_code
          ) values (
            'vendor',
            'location-1',
            1,
            'cents-order-claims-v1',
            null,
            'blocked',
            'initialize',
            'human',
            'manager-1',
            'invalid_profile_binding'
          )
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          insert into "${schema}".order_source_control_revisions (
            source,
            location_id,
            version,
            profile_version,
            from_posture,
            posture,
            event_type,
            changed_by_actor_kind,
            changed_by_actor_id,
            reason_code
          ) values (
            'cents',
            'location-1',
            2,
            'cents-order-claims-v1',
            'blocked',
            'normal',
            'restore_to_normal',
            'human',
            'manager-1',
            'invalid_graph_edge'
          )
        `),
      ).rejects.toThrow();

      await expect(
        db.unsafe(
          unconfiguredDecisionInsert(
            schema,
            '1'.repeat(64),
            'external-overreach',
            'auto_adopt',
          ),
        ),
      ).rejects.toThrow();

      await expect(
        db.unsafe(
          unconfiguredDecisionInsert(
            schema,
            '2'.repeat(64),
            'external-invalid-assurance',
            'deny',
            4,
          ),
        ),
      ).rejects.toThrow();

      await expect(
        db.unsafe(`
          update "${schema}".order_source_capability_profiles
          set policy_version = 'mutated'
          where source = 'cents'
        `),
      ).rejects.toThrow(/ORDER_SOURCE_AUTHORITY_EVIDENCE_APPEND_ONLY/);
      await expect(
        db.unsafe(`
          delete from "${schema}".order_source_control_revisions
          where source = 'cents'
        `),
      ).rejects.toThrow(/ORDER_SOURCE_AUTHORITY_EVIDENCE_APPEND_ONLY/);
      await expect(
        db.unsafe(`
          delete from "${schema}".order_source_observation_decisions
          where evaluation_key = '${'f'.repeat(64)}'
        `),
      ).rejects.toThrow(/ORDER_SOURCE_AUTHORITY_EVIDENCE_APPEND_ONLY/);

      await expect(
        db.unsafe(`
          update "${schema}".order_command_receipts
          set reason_note = 'Reason text without a code.'
          where idempotency_key = 'legacy-receipt'
        `),
      ).rejects.toThrow();
    } finally {
      await dropFixtureSchema(schema);
    }
  });
});
