import { verifyRestoredMigrationLedger } from '@pressly/postgres/migration-ledger';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  loadPostgresToolingEnvironment,
  presslyMigrationsDirectory,
  requirePostgresToolingDatabaseUrl,
} from './environment.ts';

loadPostgresToolingEnvironment();

const databaseUrl = requirePostgresToolingDatabaseUrl({
  code: 'restore_verification_database_url_missing',
  message: 'DATABASE_URL is required for restored-database verification.',
});

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

try {
  const verification = await verifyRestoredMigrationLedger({
    db,
    migrationsDirectory: presslyMigrationsDirectory,
  });
  process.stdout.write(`${JSON.stringify(verification)}\n`);
} finally {
  await client.end();
}
