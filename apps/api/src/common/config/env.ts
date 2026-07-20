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

const envRateLimit = z.coerce.number().int().positive();

const hmacKey = secret.refine(
  (value) => Buffer.byteLength(value, 'utf8') >= 32,
  'HMAC keys must contain at least 32 bytes.',
);

const base64EncryptionKey = secret.refine(
  (value) => Buffer.from(value, 'base64').length === 32,
  'Encryption keys must be base64 for exactly 32 bytes.',
);

const quarantineRetentionDays = z.coerce.number().int().min(1).max(90);

const localProcessorCsrfSecret = hmacKey.parse(
  'local-dev-processor-csrf-key-32-bytes-minimum',
);

const centsWebhookAuthMode = z.enum(['hmac', 'unsigned']);

const apiEnvSchema = z
  .object({
    NODE_ENV: nodeEnvSchema.default('development'),
    SHUTDOWN_GRACE_PERIOD_MS: envInteger.default(30_000),

    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: envPort.default(4000),

    DATABASE_URL: envUrl,
    DATABASE_MAX_CONNECTIONS: envInteger.default(10),

    CORS_ORIGIN: z.string().min(1).default('http://localhost:3000'),

    API_GLOBAL_RATE_LIMIT: envRateLimit.default(300),
    API_GLOBAL_RATE_WINDOW_SECONDS: envRateLimit.default(60),
    API_LOGIN_RATE_LIMIT: envRateLimit.default(20),
    API_LOGIN_RATE_WINDOW_SECONDS: envRateLimit.default(900),

    AUTH_SECRET: secret,
    AUTH_SESSION_TTL_MINUTES: envInteger.default(43_200),
    AUTH_SESSION_IDLE_TIMEOUT_MINUTES: envInteger.default(10_080),
    AUTH_LOGIN_WINDOW_MINUTES: envInteger.default(15),
    AUTH_LOGIN_MAX_FAILURES: envInteger.default(8),
    AUTH_FRESH_SESSION_MAX_AGE_MINUTES: envInteger.default(15),
    AUTH_MFA_CHALLENGE_TTL_MINUTES: envInteger.default(5),
    AUTH_MFA_ENCRYPTION_KEY: secret,
    AUTH_MFA_ISSUER: z.string().min(1).default('Pressly'),

    PROCESSOR_ORIGIN: z.url().optional(),
    PROCESSOR_CSRF_SECRET: hmacKey.optional(),

    CENTS_WEBHOOK_AUTH_MODE: centsWebhookAuthMode.default('hmac'),
    CENTS_WEBHOOK_HMAC_CURRENT_KEY: hmacKey.optional(),
    CENTS_WEBHOOK_HMAC_PREVIOUS_KEY: hmacKey.optional(),
    CENTS_WEBHOOK_CLOCK_WINDOW_SECONDS: envInteger.default(300),
    CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY: base64EncryptionKey.optional(),
    CENTS_WEBHOOK_QUARANTINE_RETENTION_DAYS:
      quarantineRetentionDays.default(30),

    FEATURE_METRICS_ENABLED: featureFlag,
    FEATURE_JOBS_ENABLED: featureFlag,

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
        message: 'SENTRY_DSN is required when SENTRY_ENABLED is true',
      });

    if (
      env.NODE_ENV === 'production' &&
      env.CENTS_WEBHOOK_AUTH_MODE === 'hmac' &&
      env.CENTS_WEBHOOK_HMAC_CURRENT_KEY === undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['CENTS_WEBHOOK_HMAC_CURRENT_KEY'],
        message: 'CENTS_WEBHOOK_HMAC_CURRENT_KEY is required in production.',
      });

    if (
      env.NODE_ENV === 'production' &&
      env.CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY === undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY'],
        message:
          'CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY is required in production.',
      });

    if (env.NODE_ENV === 'production' && env.PROCESSOR_ORIGIN === undefined)
      context.addIssue({
        code: 'custom',
        path: ['PROCESSOR_ORIGIN'],
        message: 'PROCESSOR_ORIGIN is required in production.',
      });

    if (
      env.NODE_ENV === 'production' &&
      env.PROCESSOR_ORIGIN !== undefined &&
      new URL(env.PROCESSOR_ORIGIN).protocol !== 'https:'
    )
      context.addIssue({
        code: 'custom',
        path: ['PROCESSOR_ORIGIN'],
        message: 'PROCESSOR_ORIGIN must use HTTPS in production.',
      });

    if (
      env.NODE_ENV === 'production' &&
      env.PROCESSOR_CSRF_SECRET === undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['PROCESSOR_CSRF_SECRET'],
        message: 'PROCESSOR_CSRF_SECRET is required in production.',
      });
  });

export const rawApiEnv = parseEnv(apiEnvSchema, process.env);

export type ApiEnv = typeof rawApiEnv;

const configuredApiEnv = {
  nodeEnv: rawApiEnv.NODE_ENV,
  shutdownGracePeriodMs: rawApiEnv.SHUTDOWN_GRACE_PERIOD_MS,
  host: rawApiEnv.API_HOST,
  port: rawApiEnv.API_PORT,
  databaseUrl: rawApiEnv.DATABASE_URL,
  databaseMaxConnections: rawApiEnv.DATABASE_MAX_CONNECTIONS,
  corsOrigin: rawApiEnv.CORS_ORIGIN,
  rateLimits: {
    global: {
      limit: rawApiEnv.API_GLOBAL_RATE_LIMIT,
      windowMs: rawApiEnv.API_GLOBAL_RATE_WINDOW_SECONDS * 1_000,
    },
    login: {
      limit: rawApiEnv.API_LOGIN_RATE_LIMIT,
      windowMs: rawApiEnv.API_LOGIN_RATE_WINDOW_SECONDS * 1_000,
    },
  },
  auth: {
    secret: rawApiEnv.AUTH_SECRET,
    sessionTtlMinutes: rawApiEnv.AUTH_SESSION_TTL_MINUTES,
    sessionIdleTimeoutMinutes: rawApiEnv.AUTH_SESSION_IDLE_TIMEOUT_MINUTES,
    loginWindowMinutes: rawApiEnv.AUTH_LOGIN_WINDOW_MINUTES,
    loginMaxFailures: rawApiEnv.AUTH_LOGIN_MAX_FAILURES,
    freshSessionMaxAgeMinutes: rawApiEnv.AUTH_FRESH_SESSION_MAX_AGE_MINUTES,
    mfaChallengeTtlMinutes: rawApiEnv.AUTH_MFA_CHALLENGE_TTL_MINUTES,
    mfaEncryptionKey: rawApiEnv.AUTH_MFA_ENCRYPTION_KEY,
    mfaIssuer: rawApiEnv.AUTH_MFA_ISSUER,
  },
  processor: {
    origin: new URL(rawApiEnv.PROCESSOR_ORIGIN ?? 'http://localhost:4173')
      .origin,
    csrfSecret: rawApiEnv.PROCESSOR_CSRF_SECRET ?? localProcessorCsrfSecret,
  },
  centsWebhook: {
    authMode: rawApiEnv.CENTS_WEBHOOK_AUTH_MODE,
    hmac: {
      currentKey: rawApiEnv.CENTS_WEBHOOK_HMAC_CURRENT_KEY,
      previousKey: rawApiEnv.CENTS_WEBHOOK_HMAC_PREVIOUS_KEY,
      clockWindowSeconds: rawApiEnv.CENTS_WEBHOOK_CLOCK_WINDOW_SECONDS,
    },
    quarantine: {
      encryptionKey: rawApiEnv.CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY,
      retentionMs:
        rawApiEnv.CENTS_WEBHOOK_QUARANTINE_RETENTION_DAYS *
        24 *
        60 *
        60 *
        1_000,
    },
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
  },
} as const;

export const apiEnv = configuredApiEnv;
