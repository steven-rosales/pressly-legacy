import 'dotenv/config';

import {
  envPort,
  envUrl,
  featureFlag,
  nodeEnvSchema,
  parseEnv,
  secret,
} from '@pressly/config';
import { z } from 'zod';

const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('dev'),

  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: envPort.default(4000),

  DATABASE_URL: envUrl,

  LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),

  CORS_ORIGIN: z.string().min(1).default(`http://localhost:4000`),

  AUTH_SECRET: secret,

  FEATURE_METRICS_ENABLED: featureFlag,
  FEATURE_JOBS_ENABLED: featureFlag,
});

export const rawApiEnv = parseEnv(apiEnvSchema, process.env);

export type ApiEnv = typeof rawApiEnv;

export const apiEnv = {
  nodeEnv: rawApiEnv.NODE_ENV,
  host: rawApiEnv.API_HOST,
  port: rawApiEnv.API_PORT,
  databaseUrl: rawApiEnv.DATABASE_URL,
  logLevel: rawApiEnv.LOG_LEVEL,
  corsOrigin: rawApiEnv.CORS_ORIGIN,
  authSecret: rawApiEnv.AUTH_SECRET,
  features: {
    metricsEnabled: rawApiEnv.FEATURE_METRICS_ENABLED,
    jobsEnabled: rawApiEnv.FEATURE_JOBS_ENABLED,
  },
} as const;
