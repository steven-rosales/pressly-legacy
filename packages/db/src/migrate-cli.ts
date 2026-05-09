import { migrateDatabase } from './migrate.ts';
import { makeAppError } from '@pressly/errors';
const databaseUrl = process.env['DATABASE_URL'];

if (databaseUrl === undefined || databaseUrl.length === 0)
  throw makeAppError({
    kind: 'DatabaseError',
    code: 'invalid_database',
    message: 'Database incorrectly configured.',
    status: 503,
  });

await migrateDatabase(databaseUrl);
