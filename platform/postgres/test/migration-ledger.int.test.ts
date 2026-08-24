import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { pgTable, text } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import {
  createPostgresRuntime,
  type PostgresDatabase,
  type PostgresExecutor,
  type PostgresTransaction,
} from '../src/client.ts';
import { checkDatabaseHealth } from '../src/health.ts';
import {
  verifyFreshMigrationLedger,
  verifyRestoredMigrationLedger,
  verifyUpgradeMigrationLedger,
} from '../src/migration-ledger.ts';
import { afterAll, describe, expect, it } from 'vitest';

const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const migrationsDirectory = resolve(
  repositoryRoot,
  'platform/postgres/migrations',
);
const adminDatabaseUrl =
  process.env['PRESSLY_POSTGRES_LEDGER_ADMIN_DATABASE_URL'] ??
  'postgres://pressly:pressly@localhost:55434/postgres';
const uniqueSuffix = `${process.pid}_${Date.now().toString(36)}`;
const freshDatabaseName = `pressly_ledger_fresh_test_${uniqueSuffix}`;
const upgradeDatabaseName = `pressly_ledger_upgrade_test_${uniqueSuffix}`;
const restoredDatabaseName = `pressly_ledger_restore_test_${uniqueSuffix}`;
const databaseNames = [
  freshDatabaseName,
  upgradeDatabaseName,
  restoredDatabaseName,
] as const;
const temporaryDirectory = await mkdtemp(
  join(tmpdir(), `pressly-ledger-${uniqueSuffix}-`),
);
const nMinusOneMigrationsDirectory = join(
  temporaryDirectory,
  'n-minus-one-migrations',
);
const dumpPath = join(temporaryDirectory, 'fresh.dump');
const runtimeSchema = {
  probe: pgTable('migration_ledger_runtime_probe', {
    id: text('id').primaryKey(),
  }),
};

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

const withDatabase = async <Value>(
  databaseName: string,
  operation: (db: ReturnType<typeof drizzle>) => Promise<Value>,
): Promise<Value> => {
  const client = postgres(databaseUrl(databaseName), { max: 1 });
  const db = drizzle(client);

  try {
    return await operation(db);
  } finally {
    await client.end();
  }
};

const applyMigrations = (
  databaseName: string,
  directory: string,
): Promise<void> =>
  withDatabase(databaseName, (db) =>
    migrate(db, { migrationsFolder: directory }),
  );

const makeNMinusOneHistory = async (): Promise<void> => {
  await cp(migrationsDirectory, nMinusOneMigrationsDirectory, {
    recursive: true,
  });
  const journalPath = join(nMinusOneMigrationsDirectory, 'meta/_journal.json');
  const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
    entries: unknown[];
  };
  journal.entries = journal.entries.slice(0, -1);
  await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
};

const databaseExists = (databaseName: string): boolean =>
  run('psql', [
    adminDatabaseUrl,
    '-Atqc',
    `select datname from pg_database where datname = '${databaseName}'`,
  ]).trim() === databaseName;

afterAll(async () => {
  for (const databaseName of databaseNames) dropDatabase(databaseName);
  await rm(temporaryDirectory, { recursive: true, force: true });
  expect(databaseNames.some(databaseExists)).toBe(false);
});

describe.sequential('PostgreSQL migration ledger verification', () => {
  it('proves fresh, N-1 upgrade, completed upgrade, and restored candidates', async () => {
    for (const databaseName of databaseNames)
      createTemplateZeroDatabase(databaseName);

    await applyMigrations(freshDatabaseName, migrationsDirectory);
    const runtime = createPostgresRuntime({
      databaseUrl: databaseUrl(freshDatabaseName),
      schema: runtimeSchema,
      maxConnections: 1,
    });
    try {
      const database: PostgresDatabase = runtime.db;
      const executor: PostgresExecutor = runtime.db;
      expect(await checkDatabaseHealth(database)).toBe(true);
      expect(executor.selectDistinct).toBeTypeOf('function');
      await database.transaction(
        async (typedTransaction) => {
          const transaction: PostgresTransaction = typedTransaction;
          const transactionExecutor: PostgresExecutor = typedTransaction;
          expect(await checkDatabaseHealth(transaction)).toBe(true);
          expect(transactionExecutor.execute).toBeTypeOf('function');
        },
        {
          isolationLevel: 'repeatable read',
          accessMode: 'read only',
        },
      );
    } finally {
      await runtime.close();
    }
    await withDatabase(freshDatabaseName, async (db) => {
      await expect(
        verifyFreshMigrationLedger({ db, migrationsDirectory }),
      ).resolves.toMatchObject({
        path: 'fresh',
        appliedCount: 2,
        latestMigrationTag: '0001_owner_database_mechanisms',
      });
    });

    await makeNMinusOneHistory();
    await applyMigrations(upgradeDatabaseName, nMinusOneMigrationsDirectory);
    await withDatabase(upgradeDatabaseName, async (db) => {
      await expect(
        verifyUpgradeMigrationLedger({
          db,
          migrationsDirectory,
          expectedAppliedCount: 1,
        }),
      ).resolves.toMatchObject({
        path: 'upgrade',
        appliedCount: 1,
        latestMigrationTag: '0000_clean_owner_schema',
      });
    });
    await applyMigrations(upgradeDatabaseName, migrationsDirectory);
    await withDatabase(upgradeDatabaseName, async (db) => {
      await expect(
        verifyUpgradeMigrationLedger({
          db,
          migrationsDirectory,
          expectedAppliedCount: 2,
        }),
      ).resolves.toMatchObject({
        path: 'upgrade',
        appliedCount: 2,
        latestMigrationTag: '0001_owner_database_mechanisms',
      });
    });

    run('pg_dump', [
      '--format=custom',
      '--no-owner',
      '--no-privileges',
      '--file',
      dumpPath,
      databaseUrl(freshDatabaseName),
    ]);
    run('pg_restore', [
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
      '--dbname',
      databaseUrl(restoredDatabaseName),
      dumpPath,
    ]);
    await withDatabase(restoredDatabaseName, async (db) => {
      await expect(
        verifyRestoredMigrationLedger({ db, migrationsDirectory }),
      ).resolves.toMatchObject({
        path: 'restore',
        appliedCount: 2,
        latestMigrationTag: '0001_owner_database_mechanisms',
      });
    });
  }, 240_000);
});
