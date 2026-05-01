import 'dotenv/config';

import { envUrl, featureFlag, nodeEnvSchema, parseEnv } from '@pressly/config';
import { z } from 'zod';

const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  DATABASE_URL: envUrl,

  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  FEATURE_JOBS_ENABLED: featureFlag,
});

const rawWorkerEnv = parseEnv(workerEnvSchema, process.env);

export type WorkerEnv = typeof rawWorkerEnv;

export const workerEnv = {
  nodeEnv: rawWorkerEnv.NODE_ENV,
  databaseUrl: rawWorkerEnv.DATABASE_URL,
  logLevel: rawWorkerEnv.LOG_LEVEL,
  features: {
    jobsEnabled: rawWorkerEnv.FEATURE_JOBS_ENABLED,
  },
} as const;
