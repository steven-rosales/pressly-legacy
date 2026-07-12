import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import {
  envSampleRate,
  envUrl,
  featureFlag,
  nodeEnvSchema,
  parseEnv,
} from '@pressly/config';
import { z } from 'zod';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../..', '.env.local'),
});

const workerEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema.default('development'),

    DATABASE_URL: envUrl,

    FEATURE_JOBS_ENABLED: featureFlag,
    WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1_000),
    WORKER_LEASE_MS: z.coerce.number().int().positive().default(30_000),
    WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(20),
    WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
    WORKER_RETRY_BASE_MS: z.coerce.number().int().positive().default(1_000),
    WORKER_RETRY_MAX_MS: z.coerce.number().int().positive().default(300_000),
    WORKER_LOOP_RETRY_BASE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(1_000),
    WORKER_LOOP_RETRY_MAX_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
    WORKER_HEARTBEAT_FILE: z
      .string()
      .startsWith('/')
      .default('/tmp/pressly-worker-heartbeat'),
    WORKER_HEARTBEAT_MAX_AGE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(90_000),
    WORKER_METRIC_LOG_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),

    SENTRY_ENABLED: featureFlag,
    SENTRY_DSN: z.url().optional(),
    SENTRY_RELEASE: z.string().min(1).optional(),
    SENTRY_TRACES_SAMPLE_RATE: envSampleRate.default(0.1),
  })
  .superRefine((env, context) => {
    if (env.SENTRY_ENABLED && env.SENTRY_DSN === undefined)
      context.addIssue({
        code: 'custom',
        path: ['SENTRY_DSN'],
        message: 'SENTRY_DSN is required when SENTRY_ENABLED is true.',
      });
    if (env.WORKER_RETRY_BASE_MS > env.WORKER_RETRY_MAX_MS)
      context.addIssue({
        code: 'custom',
        path: ['WORKER_RETRY_BASE_MS'],
        message: 'WORKER_RETRY_BASE_MS must not exceed WORKER_RETRY_MAX_MS.',
      });
    if (env.WORKER_LOOP_RETRY_BASE_MS > env.WORKER_LOOP_RETRY_MAX_MS)
      context.addIssue({
        code: 'custom',
        path: ['WORKER_LOOP_RETRY_BASE_MS'],
        message:
          'WORKER_LOOP_RETRY_BASE_MS must not exceed WORKER_LOOP_RETRY_MAX_MS.',
      });
    if (env.WORKER_HEARTBEAT_MAX_AGE_MS <= env.WORKER_POLL_INTERVAL_MS)
      context.addIssue({
        code: 'custom',
        path: ['WORKER_HEARTBEAT_MAX_AGE_MS'],
        message:
          'WORKER_HEARTBEAT_MAX_AGE_MS must exceed WORKER_POLL_INTERVAL_MS.',
      });
    if (env.NODE_ENV === 'production' && !env.FEATURE_JOBS_ENABLED)
      context.addIssue({
        code: 'custom',
        path: ['FEATURE_JOBS_ENABLED'],
        message: 'FEATURE_JOBS_ENABLED must be true in production.',
      });
    if (env.NODE_ENV === 'production' && !env.SENTRY_ENABLED)
      context.addIssue({
        code: 'custom',
        path: ['SENTRY_ENABLED'],
        message: 'SENTRY_ENABLED must be true in production.',
      });
  });

const rawWorkerEnv = parseEnv(workerEnvSchema, process.env);

export type WorkerEnv = typeof rawWorkerEnv;

export const workerEnv = {
  nodeEnv: rawWorkerEnv.NODE_ENV,
  databaseUrl: rawWorkerEnv.DATABASE_URL,
  features: {
    jobsEnabled: rawWorkerEnv.FEATURE_JOBS_ENABLED,
  },
  jobs: {
    pollIntervalMs: rawWorkerEnv.WORKER_POLL_INTERVAL_MS,
    leaseMs: rawWorkerEnv.WORKER_LEASE_MS,
    batchSize: rawWorkerEnv.WORKER_BATCH_SIZE,
    maxAttempts: rawWorkerEnv.WORKER_MAX_ATTEMPTS,
    retryBaseMs: rawWorkerEnv.WORKER_RETRY_BASE_MS,
    retryMaxMs: rawWorkerEnv.WORKER_RETRY_MAX_MS,
    loopRetryBaseMs: rawWorkerEnv.WORKER_LOOP_RETRY_BASE_MS,
    loopRetryMaxMs: rawWorkerEnv.WORKER_LOOP_RETRY_MAX_MS,
    heartbeatFile: rawWorkerEnv.WORKER_HEARTBEAT_FILE,
    heartbeatMaxAgeMs: rawWorkerEnv.WORKER_HEARTBEAT_MAX_AGE_MS,
    metricLogIntervalMs: rawWorkerEnv.WORKER_METRIC_LOG_INTERVAL_MS,
  },
  observability: {
    sentry: {
      enabled: rawWorkerEnv.SENTRY_ENABLED,
      dsn: rawWorkerEnv.SENTRY_DSN,
      release: rawWorkerEnv.SENTRY_RELEASE,
      traceSampleRate: rawWorkerEnv.SENTRY_TRACES_SAMPLE_RATE,
    },
  },
} as const;
