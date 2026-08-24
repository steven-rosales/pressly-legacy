import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, posix, relative, sep } from 'node:path';
import { invariantViolationError } from '@pressly/errors/factories';
import { sql } from 'drizzle-orm';
import type { PostgresExecutor } from './client.ts';

// This prefix is part of the clean database epoch's immutable tree identity.
const immutableMigrationTreeHashPrefix = 'platform/postgres/migrations';
const canonicalJournalRelativePath = 'meta/_journal.json';
const sha256Pattern = /^[a-f0-9]{64}$/;
const migrationTagPattern = /^\d{4}_[a-zA-Z0-9_-]+$/;
const canonicalIndices = Object.freeze([0, 1]);

export const presslyMigrationHistoryBaseline = Object.freeze({
  dialect: 'postgresql',
  version: '7',
  entryCount: 2,
  snapshotCount: 2,
  journalSha256:
    '4b3a8eac8cde509ce43ae8e9b2f1608a7ce40f30548978250715a1d157a69e2a',
  orderedTreeSha256:
    '8436950407887c0eb5ada951921dc80b56b03d96c03a9303d6c202a3b74dcbc6',
  indices: canonicalIndices,
});

export type ImmutableMigrationEntry = Readonly<{
  index: number;
  version: '7';
  timestamp: number;
  tag: string;
  sqlSha256: string;
}>;

export type ImmutableMigrationHistory = Readonly<{
  journalSha256: string;
  orderedTreeSha256: string;
  entries: readonly ImmutableMigrationEntry[];
}>;

export type MigrationLedgerVerificationPath = 'fresh' | 'upgrade' | 'restore';

export type MigrationLedgerVerification = Readonly<{
  path: MigrationLedgerVerificationPath;
  appliedCount: number;
  latestMigrationTag: string | null;
  journalSha256: string;
  orderedTreeSha256: string;
}>;

type JournalEntry = Readonly<{
  idx: number;
  version: '7';
  when: number;
  tag: string;
  breakpoints: boolean;
}>;

type Journal = Readonly<{
  version: '7';
  dialect: 'postgresql';
  entries: readonly JournalEntry[];
}>;

type MigrationLedgerDatabaseRow = Readonly<{
  id: unknown;
  hash: unknown;
  created_at: unknown;
}>;

type MigrationLedgerRow = Readonly<{
  id: number;
  hash: string;
  timestamp: number;
}>;

export type CompleteMigrationLedgerVerificationInput = Readonly<{
  db: PostgresExecutor;
  migrationsDirectory: string;
}>;

export type UpgradeMigrationLedgerVerificationInput =
  CompleteMigrationLedgerVerificationInput &
    Readonly<{
      expectedAppliedCount: number;
    }>;

const fail = (
  code: string,
  message: string,
  details?: unknown,
  cause?: unknown,
): never => {
  throw invariantViolationError({
    code,
    message,
    safeMessage: 'Database migration history verification failed.',
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause }),
  });
};

const sha256 = (value: Uint8Array | string): string =>
  createHash('sha256').update(value).digest('hex');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
): boolean => {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    keys.length === expected.length &&
    keys.every((key, index) => key === expected[index])
  );
};

const parseJournalEntry = (value: unknown, position: number): JournalEntry => {
  if (!isRecord(value))
    return fail(
      'migration_journal_entry_invalid',
      `Migration journal entry ${position} is invalid.`,
      { position },
    );

  if (
    !hasExactKeys(value, ['idx', 'version', 'when', 'tag', 'breakpoints']) ||
    !Number.isSafeInteger(value['idx']) ||
    value['version'] !== presslyMigrationHistoryBaseline.version ||
    !Number.isSafeInteger(value['when']) ||
    typeof value['tag'] !== 'string' ||
    !migrationTagPattern.test(value['tag']) ||
    typeof value['breakpoints'] !== 'boolean'
  )
    return fail(
      'migration_journal_entry_invalid',
      `Migration journal entry ${position} is invalid.`,
      { position },
    );

  return {
    idx: value['idx'] as number,
    version: '7',
    when: value['when'] as number,
    tag: value['tag'],
    breakpoints: value['breakpoints'],
  };
};

const parseJournal = (bytes: Uint8Array): Journal => {
  let value: unknown = undefined;

  try {
    value = JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch (cause) {
    fail(
      'migration_journal_json_invalid',
      'Migration journal is not valid JSON.',
      undefined,
      cause,
    );
  }

  if (!isRecord(value))
    return fail(
      'migration_journal_shape_invalid',
      'Migration journal shape, dialect, or version is invalid.',
    );

  if (
    !hasExactKeys(value, ['version', 'dialect', 'entries']) ||
    value['version'] !== presslyMigrationHistoryBaseline.version ||
    value['dialect'] !== presslyMigrationHistoryBaseline.dialect ||
    !Array.isArray(value['entries'])
  )
    return fail(
      'migration_journal_shape_invalid',
      'Migration journal shape, dialect, or version is invalid.',
    );

  const entries = value['entries'].map(parseJournalEntry);

  if (entries.length !== presslyMigrationHistoryBaseline.entryCount)
    fail(
      'migration_journal_count_mismatch',
      `Migration journal has ${entries.length} entries; expected ${presslyMigrationHistoryBaseline.entryCount}.`,
      {
        actual: entries.length,
        expected: presslyMigrationHistoryBaseline.entryCount,
      },
    );

  const seenTags = new Set<string>();
  let previousTimestamp = -1;

  entries.forEach((entry, position) => {
    const expectedIndex = canonicalIndices[position];
    if (entry.idx !== expectedIndex)
      fail(
        'migration_journal_index_mismatch',
        `Migration journal entry ${position} has index ${entry.idx}; expected ${expectedIndex}.`,
        { actual: entry.idx, expected: expectedIndex, position },
      );
    if (entry.when <= previousTimestamp)
      fail(
        'migration_journal_timestamp_order_invalid',
        `Migration journal timestamp is not strictly increasing at ${entry.tag}.`,
        { position, tag: entry.tag, timestamp: entry.when },
      );
    if (seenTags.has(entry.tag))
      fail(
        'migration_journal_tag_duplicate',
        `Migration journal tag ${entry.tag} is duplicated.`,
        { position, tag: entry.tag },
      );

    previousTimestamp = entry.when;
    seenTags.add(entry.tag);
  });

  return { version: '7', dialect: 'postgresql', entries };
};

const toCanonicalRelativePath = (path: string): string =>
  sep === posix.sep ? path : path.split(sep).join(posix.sep);

const listFiles = async (
  directory: string,
  root = directory,
): Promise<readonly string[]> => {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    return fail(
      'migration_history_read_failed',
      `Could not read migration history directory ${directory}.`,
      { directory },
      cause,
    );
  }

  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path, root)));
    else if (entry.isFile())
      files.push(toCanonicalRelativePath(relative(root, path)));
    else
      fail(
        'migration_history_entry_unsupported',
        `Migration history contains unsupported entry ${path}.`,
        { path },
      );
  }

  return files.sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
};

const readBytes = async (
  migrationsDirectory: string,
  relativePath: string,
): Promise<Uint8Array> => {
  try {
    return await readFile(join(migrationsDirectory, relativePath));
  } catch (cause) {
    return fail(
      'migration_history_file_read_failed',
      `Could not read migration history file ${relativePath}.`,
      { relativePath },
      cause,
    );
  }
};

const orderedTreeSha256 = async (
  migrationsDirectory: string,
  files: readonly string[],
): Promise<string> => {
  const treeHash = createHash('sha256');

  for (const relativePath of files) {
    const bytes = await readBytes(migrationsDirectory, relativePath);
    treeHash.update(
      `${sha256(bytes)}  ${immutableMigrationTreeHashPrefix}/${relativePath}\n`,
    );
  }

  return treeHash.digest('hex');
};

export const loadImmutableMigrationHistory = async (
  migrationsDirectory: string,
): Promise<ImmutableMigrationHistory> => {
  const files = await listFiles(migrationsDirectory);
  const journalBytes = await readBytes(
    migrationsDirectory,
    canonicalJournalRelativePath,
  );
  const journalSha256 = sha256(journalBytes);

  if (journalSha256 !== presslyMigrationHistoryBaseline.journalSha256)
    fail(
      'migration_journal_hash_mismatch',
      'Migration journal bytes differ from the immutable Pressly baseline.',
      {
        actual: journalSha256,
        expected: presslyMigrationHistoryBaseline.journalSha256,
      },
    );

  const treeSha256 = await orderedTreeSha256(migrationsDirectory, files);
  if (treeSha256 !== presslyMigrationHistoryBaseline.orderedTreeSha256)
    fail(
      'migration_tree_hash_mismatch',
      'Migration history tree differs from the immutable Pressly baseline.',
      {
        actual: treeSha256,
        expected: presslyMigrationHistoryBaseline.orderedTreeSha256,
      },
    );

  const sqlFiles = files.filter(
    (path) => !path.includes('/') && path.endsWith('.sql'),
  );
  const snapshotFiles = files.filter(
    (path) => path.startsWith('meta/') && path.endsWith('_snapshot.json'),
  );
  if (
    sqlFiles.length !== presslyMigrationHistoryBaseline.entryCount ||
    snapshotFiles.length !== presslyMigrationHistoryBaseline.snapshotCount
  )
    fail(
      'migration_history_file_count_mismatch',
      'Migration SQL or snapshot file count differs from the immutable Pressly baseline.',
      {
        actualSnapshots: snapshotFiles.length,
        actualSql: sqlFiles.length,
        expectedSnapshots: presslyMigrationHistoryBaseline.snapshotCount,
        expectedSql: presslyMigrationHistoryBaseline.entryCount,
      },
    );

  const journal = parseJournal(journalBytes);
  const expectedSqlFiles = journal.entries.map((entry) => `${entry.tag}.sql`);
  if (sqlFiles.some((file, position) => file !== expectedSqlFiles[position]))
    fail(
      'migration_history_sql_order_mismatch',
      'Migration SQL files do not exactly match the ordered journal tags.',
      { actual: sqlFiles, expected: expectedSqlFiles },
    );

  const entries = await Promise.all(
    journal.entries.map(
      async (entry): Promise<ImmutableMigrationEntry> => ({
        index: entry.idx,
        version: entry.version,
        timestamp: entry.when,
        tag: entry.tag,
        sqlSha256: sha256(
          await readBytes(migrationsDirectory, `${entry.tag}.sql`),
        ),
      }),
    ),
  );

  return Object.freeze({
    journalSha256,
    orderedTreeSha256: treeSha256,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });
};

const numberFromDatabase = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value !== 'string' && typeof value !== 'bigint') return undefined;

  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : undefined;
};

const parseLedgerRow = (
  value: Record<string, unknown>,
  position: number,
): MigrationLedgerRow => {
  const id = numberFromDatabase(value['id']);
  const timestamp = numberFromDatabase(value['created_at']);
  if (
    id === undefined ||
    id <= 0 ||
    timestamp === undefined ||
    timestamp <= 0 ||
    typeof value['hash'] !== 'string' ||
    !sha256Pattern.test(value['hash'])
  )
    return fail(
      'migration_ledger_row_invalid',
      `Migration ledger row ${position} is invalid.`,
      { position },
    );

  return { id, hash: value['hash'], timestamp };
};

const readMigrationLedger = async (
  db: PostgresExecutor,
): Promise<readonly MigrationLedgerRow[]> => {
  let rows: Iterable<Record<string, unknown>>;

  try {
    rows = await db.execute(sql<MigrationLedgerDatabaseRow>`
      select id, hash, created_at
      from drizzle.__drizzle_migrations
      order by created_at asc, id asc
    `);
  } catch (cause) {
    return fail(
      'migration_ledger_read_failed',
      'Could not read drizzle.__drizzle_migrations.',
      undefined,
      cause,
    );
  }

  return Array.from(rows, (row, position) => parseLedgerRow(row, position));
};

const assertExpectedAppliedCount = (
  expectedAppliedCount: number,
  entryCount: number,
): void => {
  if (
    Number.isSafeInteger(expectedAppliedCount) &&
    expectedAppliedCount >= 0 &&
    expectedAppliedCount <= entryCount
  )
    return;

  fail(
    'migration_expected_count_invalid',
    `Expected applied migration count ${expectedAppliedCount} is invalid.`,
    { entryCount, expectedAppliedCount },
  );
};

const verifyMigrationLedger = async (
  input: CompleteMigrationLedgerVerificationInput &
    Readonly<{
      path: MigrationLedgerVerificationPath;
      expectedAppliedCount: number;
    }>,
): Promise<MigrationLedgerVerification> => {
  const history = await loadImmutableMigrationHistory(
    input.migrationsDirectory,
  );
  assertExpectedAppliedCount(
    input.expectedAppliedCount,
    history.entries.length,
  );

  const rows = await readMigrationLedger(input.db);
  if (rows.length !== input.expectedAppliedCount)
    fail(
      'migration_ledger_count_mismatch',
      `Migration ledger has ${rows.length} rows; ${input.path} verification expected ${input.expectedAppliedCount}.`,
      {
        actual: rows.length,
        expected: input.expectedAppliedCount,
        path: input.path,
      },
    );

  rows.forEach((row, position) => {
    const expected = history.entries[position];
    if (expected === undefined)
      return fail(
        'migration_ledger_unexpected_row',
        `Migration ledger row ${position} has no journal entry.`,
        { position },
      );
    if (row.timestamp !== expected.timestamp)
      fail(
        'migration_ledger_timestamp_mismatch',
        `Migration ledger timestamp differs from journal entry ${expected.tag}.`,
        {
          actual: row.timestamp,
          expected: expected.timestamp,
          position,
          tag: expected.tag,
        },
      );
    if (row.hash !== expected.sqlSha256)
      fail(
        'migration_ledger_sql_hash_mismatch',
        `Migration ledger hash differs from checked-in SQL bytes for ${expected.tag}.`,
        {
          actual: row.hash,
          expected: expected.sqlSha256,
          position,
          tag: expected.tag,
        },
      );
  });

  return Object.freeze({
    path: input.path,
    appliedCount: rows.length,
    latestMigrationTag:
      rows.length === 0
        ? null
        : (history.entries[rows.length - 1]?.tag ?? null),
    journalSha256: history.journalSha256,
    orderedTreeSha256: history.orderedTreeSha256,
  });
};

export const verifyFreshMigrationLedger = (
  input: CompleteMigrationLedgerVerificationInput,
): Promise<MigrationLedgerVerification> =>
  verifyMigrationLedger({
    ...input,
    path: 'fresh',
    expectedAppliedCount: presslyMigrationHistoryBaseline.entryCount,
  });

export const verifyUpgradeMigrationLedger = (
  input: UpgradeMigrationLedgerVerificationInput,
): Promise<MigrationLedgerVerification> =>
  verifyMigrationLedger({ ...input, path: 'upgrade' });

export const verifyRestoredMigrationLedger = (
  input: CompleteMigrationLedgerVerificationInput,
): Promise<MigrationLedgerVerification> =>
  verifyMigrationLedger({
    ...input,
    path: 'restore',
    expectedAppliedCount: presslyMigrationHistoryBaseline.entryCount,
  });
