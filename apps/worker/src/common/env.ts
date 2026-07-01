import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import { envUrl, featureFlag, nodeEnvSchema, parseEnv } from '@pressly/config';
import { z } from 'zod';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../..', '.env.local'),
});

const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  DATABASE_URL: envUrl,

  FEATURE_JOBS_ENABLED: featureFlag,
});

const rawWorkerEnv = parseEnv(workerEnvSchema, process.env);

export type WorkerEnv = typeof rawWorkerEnv;

export const workerEnv = {
  nodeEnv: rawWorkerEnv.NODE_ENV,
  databaseUrl: rawWorkerEnv.DATABASE_URL,
  features: {
    jobsEnabled: rawWorkerEnv.FEATURE_JOBS_ENABLED,
  },
} as const;
