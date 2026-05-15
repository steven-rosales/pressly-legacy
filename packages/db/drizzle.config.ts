/// <reference types="node" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeAppError } from '@pressly/errors';
import { config as loadEnv } from 'dotenv';
import { defineConfig, type Config } from 'drizzle-kit';

loadEnv({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../apps/api/.env.local',
  ),
});

const databaseUrl = process.env['DATABASE_URL'];

if (!databaseUrl) {
  throw makeAppError({
    kind: 'ConfigError',
    code: 'missing_database_url',
    message: 'DATABASE_URL is required for drizzle.',
    safeMessage: 'Database configuration is invalid.',
    status: 500,
  });
}

export default defineConfig({
  out: './src/migrations',
  schema: './src/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
}) satisfies Config;
