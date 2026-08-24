import { invariantViolationError } from '@pressly/errors/factories';
import { runPresslyMigrations } from '@pressly/postgres/migration-runner';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import {
  loadPostgresToolingEnvironment,
  presslyMigrationsDirectory,
  requirePostgresToolingDatabaseUrl,
} from './environment.ts';

loadPostgresToolingEnvironment();

const databaseUrl = requirePostgresToolingDatabaseUrl({
  code: 'migration_database_url_missing',
  message: 'DATABASE_URL is required for database migrations.',
});
const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const readAppliedCount = async (): Promise<number> => {
  const [ledger] = await client<readonly { exists: boolean }[]>`
    select to_regclass('drizzle.__drizzle_migrations') is not null as exists
  `;
  if (ledger?.exists !== true) return 0;

  const [row] = await client<readonly { count: string }[]>`
    select count(*)::text as count from drizzle.__drizzle_migrations
  `;
  const count = Number(row?.count);
  if (!Number.isSafeInteger(count) || count < 0)
    throw invariantViolationError({
      code: 'migration_ledger_count_invalid',
      message: 'The database migration ledger count is invalid.',
      details: { count: row?.count },
    });
  return count;
};

try {
  const verification = await runPresslyMigrations({
    db,
    migrationsDirectory: presslyMigrationsDirectory,
    readAppliedCount,
    apply: () => migrate(db, { migrationsFolder: presslyMigrationsDirectory }),
  });
  process.stdout.write(`${JSON.stringify(verification)}\n`);
} finally {
  await client.end();
}
