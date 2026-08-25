import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPostgresRuntime } from '@pressly/postgres/client';
import { readExactPricingEpochSnapshot } from '@pressly/pricing-system/postgres/clean-epoch-pricing';
import { seedPricing } from '@pressly/pricing-system/seeding/pricing';
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const declarationPath = resolve(
  repositoryRoot,
  'deploy/aws/lightsail/clean-epoch-cutover.json',
);
const candidateCli = resolve(
  repositoryRoot,
  'tooling/postgres/prepare-clean-epoch-candidate.ts',
);
const migrateCli = resolve(repositoryRoot, 'tooling/postgres/migrate.ts');
const adminDatabaseUrl =
  process.env['PRESSLY_TEST_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/pressly_test';
const suffix = `${process.pid}_${Date.now().toString(36)}`;
const happySource = `pressly_epoch_source_${suffix}`;
const happyTarget = `pressly_epoch_target_${suffix}`;
const conflictSource = `pressly_epoch_conflict_source_${suffix}`;
const conflictTarget = `pressly_epoch_conflict_target_${suffix}`;
const itemConflictSource = `pressly_epoch_item_conflict_source_${suffix}`;
const itemConflictTarget = `pressly_epoch_item_conflict_target_${suffix}`;
const databaseNames = [
  happySource,
  happyTarget,
  conflictSource,
  conflictTarget,
  itemConflictSource,
  itemConflictTarget,
] as const;
type PricingDatabase = Parameters<typeof seedPricing>[0];

type Declaration = Readonly<{
  legacy: Readonly<{
    entries: readonly Readonly<{
      id: number;
      hash: string;
      createdAt: number;
    }>[];
  }>;
}>;

const declaration = JSON.parse(
  readFileSync(declarationPath, 'utf8'),
) as Declaration;

const run = (executable: string, args: readonly string[]): string =>
  execFileSync(executable, [...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 240_000,
  });

const databaseUrl = (databaseName: string): string => {
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${databaseName}`;
  url.search = '';
  return url.toString();
};

const dropDatabase = (databaseName: string): void => {
  run('dropdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--if-exists',
    '--force',
    databaseName,
  ]);
};

const createTemplateZeroDatabase = (databaseName: string): void => {
  dropDatabase(databaseName);
  run('createdb', [
    '--maintenance-db',
    adminDatabaseUrl,
    '--template',
    'template0',
    databaseName,
  ]);
};

const withClient = async <Value>(
  databaseName: string,
  operation: (client: postgres.Sql, db: PricingDatabase) => Promise<Value>,
): Promise<Value> => {
  const selectedDatabaseUrl = databaseUrl(databaseName);
  const client = postgres(selectedDatabaseUrl, {
    max: 1,
    prepare: false,
  });
  const runtime = createPostgresRuntime({
    databaseUrl: selectedDatabaseUrl,
    schema: {},
    maxConnections: 1,
  });
  const db = runtime.db as unknown as PricingDatabase;
  try {
    return await operation(client, db);
  } finally {
    await Promise.all([client.end(), runtime.close()]);
  }
};

const installLegacyFixture = async (databaseName: string): Promise<void> => {
  execFileSync(process.execPath, ['--import', 'tsx', migrateCli], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: databaseUrl(databaseName) },
    stdio: 'pipe',
    timeout: 240_000,
  });
  await withClient(databaseName, async (client, db) => {
    await seedPricing(db);

    const [washFold] = await client<readonly { id: string }[]>`
      select id::text
      from pricing_services
      where slug = 'wash-fold'
    `;
    if (washFold === undefined)
      throw new Error('Pricing service fixture is incomplete.');
    const [activeSet] = await client<readonly { id: string }[]>`
      select id::text
      from pricing_sets
      where service_id = ${washFold.id}::uuid and status = 'active'
    `;
    if (activeSet === undefined)
      throw new Error('Pricing seed fixture is incomplete.');

    await client`
      insert into pricing_sets (
        id, service_id, status, currency, effective_from, effective_to,
        created_at, updated_at
      ) values (
        '91000000-0000-4000-8000-000000000001',
        ${washFold.id}::uuid,
        'archived',
        'USD',
        '2026-06-01 12:34:56.123456+00'::timestamptz,
        '2026-07-01 01:02:03.654321+00'::timestamptz,
        '2026-06-01 12:34:56.123456+00'::timestamptz,
        '2026-07-01 01:02:03.654321+00'::timestamptz
      )
    `;
    await client`
      insert into pricing_items (
        id, pricing_set_id, code, service, category, name, unit, price_cents,
        sort_order, metadata, created_at, updated_at
      ) values (
        '91000000-0000-4000-8000-000000000002',
        '91000000-0000-4000-8000-000000000001',
        'historical_delivery_fee',
        'wash_fold',
        'Fee',
        'Historical Delivery Fee',
        'order',
        495,
        999,
        '{"source":"legacy","nested":{"b":2,"a":1}}'::jsonb,
        '2026-06-01 12:34:56.123456+00'::timestamptz,
        '2026-07-01 01:02:03.654321+00'::timestamptz
      )
    `;
    await client`
      insert into pricing_change_events (
        id, kind, actor_id, actor_kind, actor_display_name, service_slug,
        reason, old_pricing_set_id, new_pricing_set_id, input, created_at
      ) values (
        '91000000-0000-4000-8000-000000000003',
        'published',
        'legacy-owner',
        'human',
        'Legacy Owner',
        'wash-fold',
        'Protect exact history',
        '91000000-0000-4000-8000-000000000001',
        ${activeSet.id}::uuid,
        '{"items":[{"code":"delivery_fee","priceCents":0}]}'::jsonb,
        '2026-07-01 01:02:03.654321+00'::timestamptz
      )
    `;
    await client`
      insert into auth_login_attempts (email_normalized, success)
      values ('must-not-cross-the-epoch@pressly.test', false)
    `;

    await client`delete from drizzle.__drizzle_migrations`;
    for (const entry of declaration.legacy.entries)
      await client`
        insert into drizzle.__drizzle_migrations (id, hash, created_at)
        values (${entry.id}, ${entry.hash}, ${entry.createdAt})
      `;
    await client`
      select setval(
        'drizzle.__drizzle_migrations_id_seq',
        ${declaration.legacy.entries.length},
        true
      )
    `;
  });
};

const installEmptyMigrationRoleSchema = (databaseName: string): Promise<void> =>
  withClient(databaseName, async (client) => {
    await client`create schema drizzle`;
  });

const cliEnvironment = (
  sourceDatabase: string,
  targetDatabase: string,
  expectedPricingSha256?: string,
): NodeJS.ProcessEnv => ({
  ...process.env,
  DATABASE_URL: databaseUrl(sourceDatabase),
  PRESSLY_CLEAN_EPOCH_SOURCE_DATABASE: sourceDatabase,
  PRESSLY_CLEAN_EPOCH_TARGET_DATABASE: targetDatabase,
  PRESSLY_CLEAN_EPOCH_DECLARATION: declarationPath,
  ...(expectedPricingSha256 === undefined
    ? {}
    : {
        PRESSLY_CLEAN_EPOCH_EXPECTED_PRICING_SHA256: expectedPricingSha256,
      }),
});

const runCli = (
  mode: 'prepare' | 'verify',
  sourceDatabase: string,
  targetDatabase: string,
  expectedPricingSha256?: string,
): string =>
  execFileSync(process.execPath, ['--import', 'tsx', candidateCli, mode], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: cliEnvironment(sourceDatabase, targetDatabase, expectedPricingSha256),
    stdio: 'pipe',
    timeout: 240_000,
  });

afterAll(() => {
  for (const databaseName of databaseNames) dropDatabase(databaseName);
});

describe.sequential('clean database epoch candidate preparation', () => {
  it('applies the two-entry epoch and transfers exact Pricing only', async () => {
    createTemplateZeroDatabase(happySource);
    createTemplateZeroDatabase(happyTarget);
    await installLegacyFixture(happySource);
    await installEmptyMigrationRoleSchema(happyTarget);

    const stdout = runCli('prepare', happySource, happyTarget);
    const evidence = JSON.parse(stdout) as Record<string, unknown>;
    expect(evidence).toMatchObject({
      operationId: 'postgres.clean-owner-epoch.v1',
      mode: 'prepare',
      legacyLedgerSha256:
        'c91f202242118f9d515198e843a587c8746afab85515716697d86eb682090fa2',
      targetLedgerSha256:
        '627f1c15f986a6b1af3ee4f456ad4c9c3cc0cf4de90748c1c8bed812b7524f65',
      targetMigrationCount: 2,
      publicTableCount: 59,
      publicEnumCount: 6,
      pricingSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      pricingRowCounts: {
        services: 2,
        sets: 3,
        items: 33,
        changeEvents: 1,
      },
    });
    expect(stdout).not.toContain(new URL(adminDatabaseUrl).password);
    expect(
      runCli(
        'verify',
        'pressly_epoch_unreachable_legacy',
        happyTarget,
        String(evidence['pricingSha256']),
      ),
    ).toContain(String(evidence['pricingSha256']));

    const [sourceSnapshot, targetSnapshot] = await Promise.all([
      withClient(happySource, (_client, db) =>
        readExactPricingEpochSnapshot(db),
      ),
      withClient(happyTarget, (_client, db) =>
        readExactPricingEpochSnapshot(db),
      ),
    ]);
    expect(targetSnapshot).toEqual(sourceSnapshot);

    await withClient(happyTarget, async (client) => {
      const [topology] = await client<
        readonly {
          tables: number;
          enums: number;
          migrations: number;
          nonPricingRows: number;
        }[]
      >`
        select
          (select count(*)::integer from pg_tables where schemaname = 'public') as tables,
          (
            select count(*)::integer
            from pg_type type
            join pg_namespace namespace on namespace.oid = type.typnamespace
            where namespace.nspname = 'public' and type.typtype = 'e'
          ) as enums,
          (select count(*)::integer from drizzle.__drizzle_migrations) as migrations,
          (select count(*)::integer from auth_login_attempts) as "nonPricingRows"
      `;
      expect(topology).toEqual({
        tables: 59,
        enums: 6,
        migrations: 2,
        nonPricingRows: 0,
      });
    });
  }, 240_000);

  it('fails before candidate mutation when legacy Pricing violates a clean unique constraint', async () => {
    createTemplateZeroDatabase(conflictSource);
    createTemplateZeroDatabase(conflictTarget);
    await installLegacyFixture(conflictSource);
    await installEmptyMigrationRoleSchema(conflictTarget);
    await withClient(conflictSource, async (client) => {
      await client`drop index pricing_sets_active_service_unique`;
      const [service] = await client<readonly { id: string }[]>`
        select id::text from pricing_services where slug = 'wash-fold'
      `;
      if (service === undefined)
        throw new Error('Pricing conflict fixture is incomplete.');
      await client`
        insert into pricing_sets (service_id, status, currency)
        values (${service.id}::uuid, 'active', 'USD')
      `;
    });

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', candidateCli, 'prepare'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: cliEnvironment(conflictSource, conflictTarget),
        timeout: 240_000,
      },
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      operationId: 'postgres.clean-owner-epoch.v1',
      ok: false,
      error: {
        code: 'pricing_epoch_active_set_conflict',
        safeMessage: 'Exact Pricing preservation failed.',
      },
    });
    expect(result.stderr).not.toContain(new URL(adminDatabaseUrl).password);

    await withClient(conflictTarget, async (client) => {
      const [row] = await client<readonly { relations: number }[]>`
        select count(*)::integer as relations
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname not in ('pg_catalog', 'information_schema')
          and relation.relkind in ('r', 'p', 'S', 'v', 'm', 'f')
      `;
      expect(row?.relations).toBe(0);
    });
  }, 240_000);

  it('rejects a duplicate item code before the target unique index can partially copy data', async () => {
    createTemplateZeroDatabase(itemConflictSource);
    createTemplateZeroDatabase(itemConflictTarget);
    await installLegacyFixture(itemConflictSource);
    await installEmptyMigrationRoleSchema(itemConflictTarget);
    await withClient(itemConflictSource, async (client) => {
      await client`drop index pricing_items_code_per_set_unique`;
      const [item] = await client<
        readonly { pricing_set_id: string; code: string }[]
      >`
        select pricing_set_id::text, code
        from pricing_items
        order by id
        limit 1
      `;
      if (item === undefined)
        throw new Error('Pricing item conflict fixture is incomplete.');
      await client`
        insert into pricing_items (
          pricing_set_id, code, service, category, name, unit, price_cents,
          sort_order, metadata
        ) values (
          ${item.pricing_set_id}::uuid,
          ${item.code},
          'wash_fold',
          'Conflict',
          'Duplicate Code',
          'item',
          1,
          9999,
          '{}'::jsonb
        )
      `;
    });

    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', candidateCli, 'prepare'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: cliEnvironment(itemConflictSource, itemConflictTarget),
        timeout: 240_000,
      },
    );
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      ok: false,
      error: { code: 'pricing_epoch_item_code_conflict' },
    });
    await withClient(itemConflictTarget, async (client) => {
      const [row] = await client<readonly { relations: number }[]>`
        select count(*)::integer as relations
        from pg_class relation
        join pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname not in ('pg_catalog', 'information_schema')
          and relation.relkind in ('r', 'p', 'S', 'v', 'm', 'f')
      `;
      expect(row?.relations).toBe(0);
    });
  }, 240_000);
});
