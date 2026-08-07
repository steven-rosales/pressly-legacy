/// <reference types="node" />

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configError } from '@pressly/errors/factories';
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
  throw configError({
    code: 'drizzle_database_url_missing',
    message: 'DATABASE_URL is required for drizzle.',
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
