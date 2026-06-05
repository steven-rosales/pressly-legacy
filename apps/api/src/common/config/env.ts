import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

import {
  envPort,
  envUrl,
  featureFlag,
  nodeEnvSchema,
  parseEnv,
  secret,
  envSampleRate,
} from '@pressly/config';
import { z } from 'zod';

loadEnv({
  path: resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../..',
    '.env.local',
  ),
});

const envInteger = z.preprocess(
  (value) => (typeof value === 'string' ? value.replaceAll('_', '') : value),
  z.coerce.number().int().positive(),
);

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),
  SHUTDOWN_GRACE_PERIOD_MS: envInteger.default(30_000),

  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: envPort.default(4000),

  DATABASE_URL: envUrl,
  DATABASE_MAX_CONNECTIONS: envInteger.default(10),

  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

  AUTH_SECRET: secret,
  AUTH_SESSION_TTL_MINUTES: envInteger.default(720),
  AUTH_LOGIN_WINDOW_MINUTES: envInteger.default(15),
  AUTH_LOGIN_MAX_FAILURES: envInteger.default(8),
  AUTH_FRESH_SESSION_MAX_AGE_MINUTES: envInteger.default(15),

  FEATURE_METRICS_ENABLED: featureFlag,
  FEATURE_JOBS_ENABLED: featureFlag,

  SENTRY_ENABLED: featureFlag,
  SENTRY_DSN: z.url().optional(),
  SENTRY_RELEASE: z.string().min(1).optional(),
  SENTRY_TRACES_SAMPLE_RATE: envSampleRate.default(0.1),

  POSTHOG_ENABLED: featureFlag,
  POSTHOG_PROJECT_API_KEY: secret.optional(),
  POSTHOG_HOST: envUrl.default('https://us.i.posthog.com'),
});

export const rawApiEnv = parseEnv(apiEnvSchema, process.env);

export type ApiEnv = typeof rawApiEnv;

export const apiEnv = {
  nodeEnv: rawApiEnv.NODE_ENV,
  shutdownGracePeriodMs: rawApiEnv.SHUTDOWN_GRACE_PERIOD_MS,
  host: rawApiEnv.API_HOST,
  port: rawApiEnv.API_PORT,
  databaseUrl: rawApiEnv.DATABASE_URL,
  databaseMaxConnections: rawApiEnv.DATABASE_MAX_CONNECTIONS,
  logLevel: rawApiEnv.LOG_LEVEL,
  corsOrigin: rawApiEnv.CORS_ORIGIN,
  auth: {
    secret: rawApiEnv.AUTH_SECRET,
    sessionTtlMinutes: rawApiEnv.AUTH_SESSION_TTL_MINUTES,
    loginWindowMinutes: rawApiEnv.AUTH_LOGIN_WINDOW_MINUTES,
    loginMaxFailures: rawApiEnv.AUTH_LOGIN_MAX_FAILURES,
    freshSessionMaxAgeMinutes: rawApiEnv.AUTH_FRESH_SESSION_MAX_AGE_MINUTES,
  },
  features: {
    metricsEnabled: rawApiEnv.FEATURE_METRICS_ENABLED,
    jobsEnabled: rawApiEnv.FEATURE_JOBS_ENABLED,
  },
  observability: {
    sentry: {
      enabled: rawApiEnv.SENTRY_ENABLED,
      dsn: rawApiEnv.SENTRY_DSN,
      release: rawApiEnv.SENTRY_RELEASE,
      traceSampleRate: rawApiEnv.SENTRY_TRACES_SAMPLE_RATE,
    },
    posthog: {
      enabled: rawApiEnv.POSTHOG_ENABLED,
      projectApiKey: rawApiEnv.POSTHOG_PROJECT_API_KEY,
      host: rawApiEnv.POSTHOG_HOST,
    },
  },
} as const;
