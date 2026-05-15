/// <reference types="node" />

import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, type Config } from 'drizzle-kit';

loadEnv({ path: resolve(process.cwd(), '../../apps/api/.env.local') });

export default defineConfig({
  out: './src/migrations',
  schema: './src/schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL']!,
  },
}) satisfies Config;
