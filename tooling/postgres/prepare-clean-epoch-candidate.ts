import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { isAppError, isRecord } from '@pressly/errors/app-error';
import {
  configError,
  invariantViolationError,
  unexpectedError,
} from '@pressly/errors/factories';
import {
  presslyMigrationHistoryBaseline,
  verifyFreshMigrationLedger,
} from '@pressly/postgres/migration-ledger';
import { runPresslyMigrations } from '@pressly/postgres/migration-runner';
import { sql } from '@pressly/postgres/query';
import {
  exactPricingEpochTableOrder,
  readExactPricingEpochSnapshot,
  transferExactPricingEpoch,
  type ExactPricingEpochRowCounts,
} from '@pressly/pricing-system/postgres/clean-epoch-pricing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { presslyMigrationsDirectory } from './environment.ts';

const sha256Pattern = /^[a-f0-9]{64}$/u;
const databaseNamePattern = /^[a-z][a-z0-9_]{0,62}$/u;
const migrationTagPattern = /^\d{4}_[a-zA-Z0-9_-]+$/u;

export type DeclaredMigrationLedgerEntry = Readonly<{
  id: number;
  hash: string;
  createdAt: number;
  tag: string;
}>;

export type CleanEpochCutoverDeclaration = Readonly<{
  schemaVersion: 1;
  operationId: 'postgres.clean-owner-epoch.v1';
  cutoverId: 'clean-owner-epoch-v1';
  legacyReleaseSha: string;
  legacyLedgerSha256: string;
  targetJournalSha256: string;
  targetTreeSha256: string;
  candidateDatabasePrefix: string;
  legacy: Readonly<{
    sourceCommit: string;
    journalSha256: string;
    orderedTreeSha256: string;
    orderedLedgerSha256: string;
    ledgerTupleFormat: 'id|hash|created_at\\n';
    entries: readonly DeclaredMigrationLedgerEntry[];
  }>;
  target: Readonly<{
    entryCount: number;
    journalSha256: string;
    orderedTreeSha256: string;
    orderedLedgerSha256: string;
    publicTableCount: number;
    publicEnumCount: number;
  }>;
  preservation: Readonly<{
    owner: 'pricing';
    copyOrder: readonly string[];
    discard: 'all-non-pricing-data';
  }>;
}>;

type DatabaseLedgerRow = Readonly<{
  id: unknown;
  hash: unknown;
  created_at: unknown;
}>;

type CandidatePreflightRow = Readonly<{
  database_name: unknown;
  database_owned_by_current_user: unknown;
  template_encoding_matches: unknown;
  template_collation_matches: unknown;
  user_relation_count: unknown;
  user_function_count: unknown;
  unexpected_schema_count: unknown;
  unexpected_extension_count: unknown;
  public_enum_count: unknown;
  drizzle_schema_present: unknown;
}>;

type CandidateTopologyRow = Readonly<{
  public_table_count: unknown;
  public_enum_count: unknown;
}>;

export type CleanEpochCandidateEvidence = Readonly<{
  operationId: 'postgres.clean-owner-epoch.v1';
  mode: 'prepare' | 'verify';
  legacyLedgerSha256: string;
  targetLedgerSha256: string;
  targetMigrationCount: number;
  publicTableCount: number;
  publicEnumCount: number;
  pricingSha256: string;
  pricingRowCounts: ExactPricingEpochRowCounts;
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
    safeMessage: 'Clean database epoch candidate preparation failed.',
    ...(details === undefined ? {} : { details }),
    ...(cause === undefined ? {} : { cause }),
  });
};

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, position) => key === expected[position])
  );
};

const requiredRecord = (
  value: unknown,
  field: string,
): Record<string, unknown> =>
  isRecord(value)
    ? value
    : fail(
        'clean_epoch_declaration_invalid',
        `Clean-epoch declaration field ${field} must be an object.`,
        { field },
      );

const requiredString = (
  value: Record<string, unknown>,
  field: string,
): string =>
  typeof value[field] === 'string'
    ? value[field]
    : fail(
        'clean_epoch_declaration_invalid',
        `Clean-epoch declaration field ${field} must be a string.`,
        { field },
      );

const requiredInteger = (
  value: Record<string, unknown>,
  field: string,
): number =>
  Number.isSafeInteger(value[field])
    ? (value[field] as number)
    : fail(
        'clean_epoch_declaration_invalid',
        `Clean-epoch declaration field ${field} must be an integer.`,
        { field },
      );

export const migrationLedgerSha256 = (
  entries: readonly Pick<
    DeclaredMigrationLedgerEntry,
    'id' | 'hash' | 'createdAt'
  >[],
): string => {
  const canonical = `${entries
    .map((entry) => `${entry.id}|${entry.hash}|${entry.createdAt}`)
    .join('\n')}\n`;
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
};

const parseLedgerEntries = (
  value: unknown,
): readonly DeclaredMigrationLedgerEntry[] => {
  if (!Array.isArray(value) || value.length !== 40)
    return fail(
      'clean_epoch_declaration_invalid',
      'The legacy migration declaration must contain exactly 40 entries.',
    );

  let priorTimestamp = -1;
  const entries = value.map((item, position) => {
    const entry = requiredRecord(item, `legacy.entries[${position}]`);
    if (!exactKeys(entry, ['id', 'hash', 'createdAt', 'tag']))
      return fail(
        'clean_epoch_declaration_invalid',
        `Legacy migration entry ${position} has unexpected fields.`,
        { position },
      );
    const id = requiredInteger(entry, 'id');
    const hash = requiredString(entry, 'hash');
    const createdAt = requiredInteger(entry, 'createdAt');
    const tag = requiredString(entry, 'tag');
    if (
      id !== position + 1 ||
      !sha256Pattern.test(hash) ||
      createdAt <= priorTimestamp ||
      !migrationTagPattern.test(tag)
    )
      return fail(
        'clean_epoch_declaration_invalid',
        `Legacy migration entry ${position} is not canonical.`,
        { position },
      );
    priorTimestamp = createdAt;
    return Object.freeze({ id, hash, createdAt, tag });
  });
  return Object.freeze(entries);
};

export const parseCleanEpochCutoverDeclaration = (
  value: unknown,
): CleanEpochCutoverDeclaration => {
  const root = requiredRecord(value, 'root');
  if (
    !exactKeys(root, [
      'schemaVersion',
      'operationId',
      'cutoverId',
      'legacyReleaseSha',
      'legacyLedgerSha256',
      'targetJournalSha256',
      'targetTreeSha256',
      'candidateDatabasePrefix',
      'legacy',
      'target',
      'preservation',
    ]) ||
    root['schemaVersion'] !== 1 ||
    root['operationId'] !== 'postgres.clean-owner-epoch.v1' ||
    root['cutoverId'] !== 'clean-owner-epoch-v1'
  )
    return fail(
      'clean_epoch_declaration_invalid',
      'The clean-epoch declaration identity is invalid.',
    );

  const candidateDatabasePrefix = requiredString(
    root,
    'candidateDatabasePrefix',
  );
  if (!databaseNamePattern.test(candidateDatabasePrefix))
    fail(
      'clean_epoch_declaration_invalid',
      'The clean-epoch candidate database prefix is invalid.',
    );

  const legacy = requiredRecord(root['legacy'], 'legacy');
  const target = requiredRecord(root['target'], 'target');
  const preservation = requiredRecord(root['preservation'], 'preservation');
  const entries = parseLedgerEntries(legacy['entries']);
  const legacyLedgerSha256 = requiredString(legacy, 'orderedLedgerSha256');
  if (
    !exactKeys(legacy, [
      'sourceCommit',
      'journalSha256',
      'orderedTreeSha256',
      'orderedLedgerSha256',
      'ledgerTupleFormat',
      'entries',
    ]) ||
    !/^[a-f0-9]{40}$/u.test(requiredString(legacy, 'sourceCommit')) ||
    !sha256Pattern.test(requiredString(legacy, 'journalSha256')) ||
    !sha256Pattern.test(requiredString(legacy, 'orderedTreeSha256')) ||
    !sha256Pattern.test(legacyLedgerSha256) ||
    legacy['ledgerTupleFormat'] !== 'id|hash|created_at\\n' ||
    migrationLedgerSha256(entries) !== legacyLedgerSha256
  )
    return fail(
      'clean_epoch_declaration_invalid',
      'The legacy migration fingerprint declaration is invalid.',
    );

  const targetEntryCount = requiredInteger(target, 'entryCount');
  const targetJournalSha256 = requiredString(target, 'journalSha256');
  const targetTreeSha256 = requiredString(target, 'orderedTreeSha256');
  const targetLedgerSha256 = requiredString(target, 'orderedLedgerSha256');
  const publicTableCount = requiredInteger(target, 'publicTableCount');
  const publicEnumCount = requiredInteger(target, 'publicEnumCount');
  if (
    !exactKeys(target, [
      'entryCount',
      'journalSha256',
      'orderedTreeSha256',
      'orderedLedgerSha256',
      'publicTableCount',
      'publicEnumCount',
    ]) ||
    targetEntryCount !== presslyMigrationHistoryBaseline.entryCount ||
    targetJournalSha256 !== presslyMigrationHistoryBaseline.journalSha256 ||
    targetTreeSha256 !== presslyMigrationHistoryBaseline.orderedTreeSha256 ||
    !sha256Pattern.test(targetLedgerSha256) ||
    publicTableCount <= 0 ||
    publicEnumCount <= 0
  )
    return fail(
      'clean_epoch_declaration_invalid',
      'The clean target migration declaration is invalid.',
    );

  if (
    root['legacyReleaseSha'] !== legacy['sourceCommit'] ||
    root['legacyLedgerSha256'] !== legacyLedgerSha256 ||
    root['targetJournalSha256'] !== targetJournalSha256 ||
    root['targetTreeSha256'] !== targetTreeSha256
  )
    return fail(
      'clean_epoch_declaration_invalid',
      'The host cutover bindings differ from the nested epoch declaration.',
    );

  if (
    !exactKeys(preservation, ['owner', 'copyOrder', 'discard']) ||
    preservation['owner'] !== 'pricing' ||
    preservation['discard'] !== 'all-non-pricing-data' ||
    !Array.isArray(preservation['copyOrder']) ||
    preservation['copyOrder'].length !== exactPricingEpochTableOrder.length ||
    preservation['copyOrder'].some(
      (table, position) => table !== exactPricingEpochTableOrder[position],
    )
  )
    return fail(
      'clean_epoch_declaration_invalid',
      'The clean-epoch preservation declaration is invalid.',
    );

  return Object.freeze({
    schemaVersion: 1,
    operationId: 'postgres.clean-owner-epoch.v1',
    cutoverId: 'clean-owner-epoch-v1',
    legacyReleaseSha: requiredString(root, 'legacyReleaseSha'),
    legacyLedgerSha256: requiredString(root, 'legacyLedgerSha256'),
    targetJournalSha256: requiredString(root, 'targetJournalSha256'),
    targetTreeSha256: requiredString(root, 'targetTreeSha256'),
    candidateDatabasePrefix,
    legacy: Object.freeze({
      sourceCommit: requiredString(legacy, 'sourceCommit'),
      journalSha256: requiredString(legacy, 'journalSha256'),
      orderedTreeSha256: requiredString(legacy, 'orderedTreeSha256'),
      orderedLedgerSha256: legacyLedgerSha256,
      ledgerTupleFormat: 'id|hash|created_at\\n',
      entries,
    }),
    target: Object.freeze({
      entryCount: targetEntryCount,
      journalSha256: targetJournalSha256,
      orderedTreeSha256: targetTreeSha256,
      orderedLedgerSha256: targetLedgerSha256,
      publicTableCount,
      publicEnumCount,
    }),
    preservation: Object.freeze({
      owner: 'pricing',
      copyOrder: exactPricingEpochTableOrder,
      discard: 'all-non-pricing-data',
    }),
  });
};

export const loadCleanEpochCutoverDeclaration = async (
  path: string,
): Promise<CleanEpochCutoverDeclaration> => {
  try {
    return parseCleanEpochCutoverDeclaration(
      JSON.parse(await readFile(path, 'utf8')) as unknown,
    );
  } catch (cause) {
    if (isAppError(cause)) throw cause;
    return fail(
      'clean_epoch_declaration_read_failed',
      'The clean-epoch declaration could not be read.',
      undefined,
      cause,
    );
  }
};

const validateDatabaseName = (input: {
  readonly name: string;
  readonly field: string;
  readonly requiredPrefix?: string;
}): void => {
  if (
    !databaseNamePattern.test(input.name) ||
    (input.requiredPrefix !== undefined &&
      !input.name.startsWith(input.requiredPrefix)) ||
    ['postgres', 'template0', 'template1'].includes(input.name)
  )
    fail(
      'clean_epoch_database_name_invalid',
      `The ${input.field} database name is invalid.`,
      { field: input.field },
    );
};

export const deriveDatabaseUrl = (
  baseDatabaseUrl: string,
  databaseName: string,
): string => {
  let parsed: URL;
  try {
    parsed = new URL(baseDatabaseUrl);
  } catch (cause) {
    throw configError({
      code: 'clean_epoch_database_url_invalid',
      message: 'DATABASE_URL is not a valid URL.',
      cause,
    });
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    parsed.username === '' ||
    parsed.hostname === ''
  )
    throw configError({
      code: 'clean_epoch_database_url_invalid',
      message: 'DATABASE_URL must be a PostgreSQL connection URL.',
    });

  validateDatabaseName({ name: databaseName, field: 'selected' });
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
};

const parseLedgerRows = (
  rows: Iterable<DatabaseLedgerRow>,
): readonly DeclaredMigrationLedgerEntry[] =>
  Object.freeze(
    Array.from(rows, (row, position) => {
      const id = Number(row.id);
      const createdAt = Number(row.created_at);
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        typeof row.hash !== 'string' ||
        !sha256Pattern.test(row.hash) ||
        !Number.isSafeInteger(createdAt) ||
        createdAt <= 0
      )
        return fail(
          'clean_epoch_ledger_row_invalid',
          `Migration ledger row ${position} is invalid.`,
          { position },
        );
      return Object.freeze({ id, hash: row.hash, createdAt, tag: '' });
    }),
  );

const readLedger = async (
  db: ReturnType<typeof drizzle>,
): Promise<readonly DeclaredMigrationLedgerEntry[]> =>
  parseLedgerRows(
    await db.execute(sql<DatabaseLedgerRow>`
      select id::text as id, hash, created_at::text as created_at
      from drizzle.__drizzle_migrations
      order by created_at asc, id asc
    `),
  );

export const assertLegacyMigrationLedger = (
  actual: readonly DeclaredMigrationLedgerEntry[],
  declaration: CleanEpochCutoverDeclaration,
): string => {
  if (actual.length !== declaration.legacy.entries.length)
    return fail(
      'clean_epoch_legacy_ledger_mismatch',
      'The source database is not on the declared legacy migration ledger.',
      {
        actualCount: actual.length,
        expectedCount: declaration.legacy.entries.length,
      },
    );
  actual.forEach((row, position) => {
    const expected = declaration.legacy.entries[position];
    if (
      expected === undefined ||
      row.id !== expected.id ||
      row.hash !== expected.hash ||
      row.createdAt !== expected.createdAt
    )
      fail(
        'clean_epoch_legacy_ledger_mismatch',
        `Legacy migration ledger row ${position} differs from the authorized fingerprint.`,
        { position },
      );
  });
  const digest = migrationLedgerSha256(actual);
  if (digest !== declaration.legacy.orderedLedgerSha256)
    fail(
      'clean_epoch_legacy_ledger_mismatch',
      'The complete legacy migration ledger fingerprint differs from the authorized fingerprint.',
    );
  return digest;
};

const oneRow = <Row>(
  rows: Iterable<Row>,
  code: string,
  message: string,
): Row => {
  const values = Array.from(rows);
  if (values.length !== 1 || values[0] === undefined)
    return fail(code, message);
  return values[0];
};

const integer = (value: unknown): number => {
  const converted = Number(value);
  return Number.isSafeInteger(converted) ? converted : Number.NaN;
};

const assertPristineTemplateZeroCandidate = async (
  db: ReturnType<typeof drizzle>,
  candidateDatabaseName: string,
): Promise<void> => {
  const row = oneRow(
    await db.execute(sql<CandidatePreflightRow>`
      select
        current_database() as database_name,
        pg_get_userbyid(candidate.datdba) = current_user
          as database_owned_by_current_user,
        candidate.encoding = template.encoding as template_encoding_matches,
        candidate.datcollate = template.datcollate
          and candidate.datctype = template.datctype
          as template_collation_matches,
        (
          select count(*)::integer
          from pg_class relation
          join pg_namespace namespace on namespace.oid = relation.relnamespace
          where namespace.nspname not in ('pg_catalog', 'information_schema')
            and relation.relkind in ('r', 'p', 'S', 'v', 'm', 'f')
        ) as user_relation_count,
        (
          select count(*)::integer
          from pg_type type
          join pg_namespace namespace on namespace.oid = type.typnamespace
          where namespace.nspname = 'public' and type.typtype = 'e'
        ) as public_enum_count,
        (
          select count(*)::integer
          from pg_proc procedure
          join pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname in ('public', 'drizzle')
        ) as user_function_count,
        (
          select count(*)::integer
          from pg_namespace
          where nspname not in ('pg_catalog', 'information_schema', 'public', 'drizzle')
            and nspname !~ '^pg_'
        ) as unexpected_schema_count,
        (
          select count(*)::integer
          from pg_extension
          where extname <> 'plpgsql'
        ) as unexpected_extension_count,
        exists (
          select 1 from pg_namespace where nspname = 'drizzle'
        ) as drizzle_schema_present
      from pg_database candidate
      cross join pg_database template
      where candidate.datname = current_database()
        and template.datname = 'template0'
    `),
    'clean_epoch_candidate_preflight_invalid',
    'The candidate database preflight returned an invalid result.',
  );
  if (
    row['database_name'] !== candidateDatabaseName ||
    row['database_owned_by_current_user'] !== true ||
    row['template_encoding_matches'] !== true ||
    row['template_collation_matches'] !== true ||
    integer(row['user_relation_count']) !== 0 ||
    integer(row['user_function_count']) !== 0 ||
    integer(row['unexpected_schema_count']) !== 0 ||
    integer(row['unexpected_extension_count']) !== 0 ||
    integer(row['public_enum_count']) !== 0 ||
    typeof row['drizzle_schema_present'] !== 'boolean'
  )
    fail(
      'clean_epoch_candidate_not_pristine',
      'The candidate is not an empty, current-user-owned template0 database.',
    );
};

const readAppliedCount = async (
  db: ReturnType<typeof drizzle>,
): Promise<number> => {
  const relation = oneRow(
    await db.execute(sql<Readonly<{ exists: unknown }>>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists
    `),
    'clean_epoch_candidate_ledger_probe_invalid',
    'The candidate migration ledger probe returned an invalid result.',
  );
  if (relation['exists'] !== true) return 0;
  const row = oneRow(
    await db.execute(sql<Readonly<{ count: unknown }>>`
      select count(*)::integer as count
      from drizzle.__drizzle_migrations
    `),
    'clean_epoch_candidate_ledger_probe_invalid',
    'The candidate migration ledger count returned an invalid result.',
  );
  const count = integer(row['count']);
  if (!Number.isSafeInteger(count) || count < 0)
    fail(
      'clean_epoch_candidate_ledger_probe_invalid',
      'The candidate migration ledger count is invalid.',
    );
  return count;
};

const verifyCandidateTopology = async (
  db: ReturnType<typeof drizzle>,
  declaration: CleanEpochCutoverDeclaration,
): Promise<Readonly<{ publicTableCount: number; publicEnumCount: number }>> => {
  const row = oneRow(
    await db.execute(sql<CandidateTopologyRow>`
      select
        (
          select count(*)::integer
          from pg_tables
          where schemaname = 'public'
        ) as public_table_count,
        (
          select count(*)::integer
          from pg_type type
          join pg_namespace namespace on namespace.oid = type.typnamespace
          where namespace.nspname = 'public' and type.typtype = 'e'
        ) as public_enum_count
    `),
    'clean_epoch_candidate_topology_invalid',
    'The candidate topology query returned an invalid result.',
  );
  const publicTableCount = integer(row['public_table_count']);
  const publicEnumCount = integer(row['public_enum_count']);
  if (
    publicTableCount !== declaration.target.publicTableCount ||
    publicEnumCount !== declaration.target.publicEnumCount
  )
    fail(
      'clean_epoch_candidate_topology_mismatch',
      'The candidate database topology differs from the clean epoch declaration.',
      {
        actualEnums: publicEnumCount,
        actualTables: publicTableCount,
        expectedEnums: declaration.target.publicEnumCount,
        expectedTables: declaration.target.publicTableCount,
      },
    );
  return Object.freeze({ publicTableCount, publicEnumCount });
};

const verifyTargetLedger = async (
  db: ReturnType<typeof drizzle>,
  declaration: CleanEpochCutoverDeclaration,
): Promise<string> => {
  await verifyFreshMigrationLedger({
    db,
    migrationsDirectory: presslyMigrationsDirectory,
  });
  const entries = await readLedger(db);
  const digest = migrationLedgerSha256(entries);
  if (
    entries.length !== declaration.target.entryCount ||
    digest !== declaration.target.orderedLedgerSha256
  )
    fail(
      'clean_epoch_candidate_ledger_mismatch',
      'The candidate migration ledger differs from the clean epoch declaration.',
    );
  return digest;
};

export const prepareOrVerifyCleanEpochCandidate = async (input: {
  readonly mode: 'prepare' | 'verify';
  readonly baseDatabaseUrl: string;
  readonly sourceDatabaseName: string;
  readonly targetDatabaseName: string;
  readonly declaration: CleanEpochCutoverDeclaration;
  readonly expectedPricingSha256?: string;
}): Promise<CleanEpochCandidateEvidence> => {
  validateDatabaseName({ name: input.sourceDatabaseName, field: 'source' });
  validateDatabaseName({
    name: input.targetDatabaseName,
    field: 'target',
    ...(input.mode === 'prepare'
      ? { requiredPrefix: input.declaration.candidateDatabasePrefix }
      : {}),
  });
  if (input.sourceDatabaseName === input.targetDatabaseName)
    fail(
      'clean_epoch_database_identity_conflict',
      'The source and candidate database names must be different.',
    );

  if (
    input.mode === 'verify' &&
    (input.expectedPricingSha256 === undefined ||
      !sha256Pattern.test(input.expectedPricingSha256))
  )
    fail(
      'clean_epoch_expected_pricing_digest_invalid',
      'Target-only verification requires the journaled Pricing digest.',
    );

  const targetUrl = deriveDatabaseUrl(
    input.baseDatabaseUrl,
    input.targetDatabaseName,
  );
  const sourceClient =
    input.mode === 'prepare'
      ? postgres(
          deriveDatabaseUrl(input.baseDatabaseUrl, input.sourceDatabaseName),
          {
            max: 1,
            prepare: false,
            onnotice: () => undefined,
          },
        )
      : undefined;
  const targetClient = postgres(targetUrl, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  const targetDb = drizzle(targetClient);

  try {
    let expectedPricingSha256 = input.expectedPricingSha256;
    let legacyLedgerSha256 = input.declaration.legacy.orderedLedgerSha256;

    if (input.mode === 'prepare') {
      const legacyClient = sourceClient;
      if (legacyClient === undefined)
        return fail(
          'clean_epoch_source_connection_missing',
          'Legacy source connection is missing during candidate preparation.',
        );
      const sourceDb = drizzle(legacyClient);
      legacyLedgerSha256 = assertLegacyMigrationLedger(
        await readLedger(sourceDb),
        input.declaration,
      );
      const sourcePricing = await readExactPricingEpochSnapshot(sourceDb);
      expectedPricingSha256 = sourcePricing.sha256;
      await assertPristineTemplateZeroCandidate(
        targetDb,
        input.targetDatabaseName,
      );
      await runPresslyMigrations({
        db: targetDb,
        migrationsDirectory: presslyMigrationsDirectory,
        readAppliedCount: () => readAppliedCount(targetDb),
        apply: () =>
          migrate(targetDb, { migrationsFolder: presslyMigrationsDirectory }),
      });
      await transferExactPricingEpoch({
        target: targetDb,
        sourceSnapshot: sourcePricing,
      });
    }
    if (expectedPricingSha256 === undefined)
      fail(
        'clean_epoch_expected_pricing_digest_invalid',
        'Pricing digest is missing after clean-epoch preparation.',
      );

    const targetLedgerSha256 = await verifyTargetLedger(
      targetDb,
      input.declaration,
    );
    const topology = await verifyCandidateTopology(targetDb, input.declaration);
    const targetPricing = await readExactPricingEpochSnapshot(targetDb);
    if (targetPricing.sha256 !== expectedPricingSha256)
      fail(
        'clean_epoch_candidate_pricing_mismatch',
        'The target Pricing digest differs from the journaled exact digest.',
        {
          actual: targetPricing.sha256,
          expected: expectedPricingSha256,
        },
      );

    return Object.freeze({
      operationId: input.declaration.operationId,
      mode: input.mode,
      legacyLedgerSha256,
      targetLedgerSha256,
      targetMigrationCount: input.declaration.target.entryCount,
      ...topology,
      pricingSha256: targetPricing.sha256,
      pricingRowCounts: targetPricing.rowCounts,
    });
  } catch (cause) {
    if (isAppError(cause)) throw cause;
    return fail(
      'clean_epoch_candidate_preparation_failed',
      'Clean-epoch candidate preparation failed.',
      undefined,
      cause,
    );
  } finally {
    await Promise.allSettled([
      ...(sourceClient === undefined ? [] : [sourceClient.end()]),
      targetClient.end(),
    ]);
  }
};

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (value !== undefined && value.trim() !== '') return value;
  throw configError({
    code: 'clean_epoch_environment_missing',
    message: `${name} is required for clean-epoch candidate preparation.`,
  });
};

const main = async (): Promise<void> => {
  const mode = process.argv[2];
  if (mode !== 'prepare' && mode !== 'verify')
    throw configError({
      code: 'clean_epoch_mode_invalid',
      message: 'Usage: prepare-clean-epoch-candidate.ts prepare|verify',
    });

  const declaration = await loadCleanEpochCutoverDeclaration(
    requiredEnvironment('PRESSLY_CLEAN_EPOCH_DECLARATION'),
  );
  const evidence = await prepareOrVerifyCleanEpochCandidate({
    mode,
    baseDatabaseUrl: requiredEnvironment('DATABASE_URL'),
    sourceDatabaseName: requiredEnvironment(
      'PRESSLY_CLEAN_EPOCH_SOURCE_DATABASE',
    ),
    targetDatabaseName: requiredEnvironment(
      'PRESSLY_CLEAN_EPOCH_TARGET_DATABASE',
    ),
    declaration,
    ...(mode === 'verify'
      ? {
          expectedPricingSha256: requiredEnvironment(
            'PRESSLY_CLEAN_EPOCH_EXPECTED_PRICING_SHA256',
          ),
        }
      : {}),
  });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
};

const entrypoint =
  process.argv[1] === undefined
    ? undefined
    : pathToFileURL(process.argv[1]).href;
if (entrypoint === import.meta.url)
  main().catch((cause: unknown) => {
    const error = isAppError(cause)
      ? cause
      : unexpectedError({
          code: 'clean_epoch_candidate_unexpected',
          message: 'Clean-epoch candidate preparation failed unexpectedly.',
          cause,
        });
    process.stderr.write(
      `${JSON.stringify({
        operationId: 'postgres.clean-owner-epoch.v1',
        ok: false,
        error: { code: error.code, safeMessage: error.safeMessage },
      })}\n`,
    );
    process.exitCode = 1;
  });
