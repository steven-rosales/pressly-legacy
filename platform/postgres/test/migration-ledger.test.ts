import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppError } from '@pressly/errors/app-error';
import type { PostgresExecutor } from '../src/client.ts';
import {
  loadImmutableMigrationHistory,
  presslyMigrationHistoryBaseline,
  verifyFreshMigrationLedger,
  verifyRestoredMigrationLedger,
  verifyUpgradeMigrationLedger,
} from '../src/migration-ledger.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = resolve(packageRoot, 'migrations');
const temporaryDirectories: string[] = [];

const databaseWithRows = (rows: readonly object[]): PostgresExecutor =>
  ({ execute: vi.fn().mockResolvedValue(rows) }) as never;

const appErrorCode = (error: unknown): string | undefined =>
  (error as Partial<AppError>).code;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('immutable Pressly migration history', () => {
  it('pins the two-entry clean owner epoch and complete ordered tree', async () => {
    const history = await loadImmutableMigrationHistory(migrationsDirectory);

    expect(history.journalSha256).toBe(
      presslyMigrationHistoryBaseline.journalSha256,
    );
    expect(history.orderedTreeSha256).toBe(
      presslyMigrationHistoryBaseline.orderedTreeSha256,
    );
    expect(history.entries).toHaveLength(2);
    expect(history.entries.map((entry) => entry.index)).toEqual([0, 1]);
    expect(history.entries.every((entry) => entry.version === '7')).toBe(true);
  });

  it('fails closed when one checked-in SQL byte changes', async () => {
    const copy = await mkdtemp(join(tmpdir(), 'pressly-migrations-'));
    temporaryDirectories.push(copy);
    await cp(migrationsDirectory, copy, { recursive: true });
    const migrationPath = join(copy, '0001_owner_database_mechanisms.sql');
    const migration = await readFile(migrationPath, 'utf8');
    await writeFile(migrationPath, `${migration}\n`, 'utf8');

    await expect(loadImmutableMigrationHistory(copy)).rejects.toSatisfy(
      (error: unknown) =>
        appErrorCode(error) === 'migration_tree_hash_mismatch',
    );
  });
});

describe('migration ledger verification paths', () => {
  it('verifies fresh, N-1 upgrade, completed upgrade, and restore ledgers', async () => {
    const history = await loadImmutableMigrationHistory(migrationsDirectory);
    const rows = history.entries.map((entry, index) => ({
      id: index + 1,
      hash: entry.sqlSha256,
      created_at: String(entry.timestamp),
    }));

    await expect(
      verifyFreshMigrationLedger({
        db: databaseWithRows(rows),
        migrationsDirectory,
      }),
    ).resolves.toMatchObject({
      path: 'fresh',
      appliedCount: 2,
      latestMigrationTag: '0001_owner_database_mechanisms',
    });
    await expect(
      verifyUpgradeMigrationLedger({
        db: databaseWithRows(rows.slice(0, -1)),
        migrationsDirectory,
        expectedAppliedCount: 1,
      }),
    ).resolves.toMatchObject({
      path: 'upgrade',
      appliedCount: 1,
      latestMigrationTag: '0000_clean_owner_schema',
    });
    await expect(
      verifyUpgradeMigrationLedger({
        db: databaseWithRows(rows),
        migrationsDirectory,
        expectedAppliedCount: 2,
      }),
    ).resolves.toMatchObject({ path: 'upgrade', appliedCount: 2 });
    await expect(
      verifyRestoredMigrationLedger({
        db: databaseWithRows(rows),
        migrationsDirectory,
      }),
    ).resolves.toMatchObject({ path: 'restore', appliedCount: 2 });
  });

  it.each([
    {
      code: 'migration_ledger_count_mismatch',
      mutate: (rows: object[]) => rows.slice(0, -1),
    },
    {
      code: 'migration_ledger_timestamp_mismatch',
      mutate: (rows: object[]) => [
        { ...rows[0], created_at: '1778523826078' },
        ...rows.slice(1),
      ],
    },
    {
      code: 'migration_ledger_sql_hash_mismatch',
      mutate: (rows: object[]) => [
        { ...rows[0], hash: '0'.repeat(64) },
        ...rows.slice(1),
      ],
    },
  ])('rejects database divergence: $code', async ({ code, mutate }) => {
    const history = await loadImmutableMigrationHistory(migrationsDirectory);
    const rows = history.entries.map((entry, index) => ({
      id: index + 1,
      hash: entry.sqlSha256,
      created_at: entry.timestamp,
    }));

    await expect(
      verifyFreshMigrationLedger({
        db: databaseWithRows(mutate(rows)),
        migrationsDirectory,
      }),
    ).rejects.toSatisfy((error: unknown) => appErrorCode(error) === code);
  });
});
