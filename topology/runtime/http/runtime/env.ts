import {
  envPort,
  envSentryDsn,
  envUrl,
  featureFlag,
  nodeEnvSchema,
  parseEnv,
  secret,
  envSampleRate,
} from '@pressly/config';
import { decodeBase64Bytes } from '@pressly/codec';
import { z } from 'zod';

const envInteger = z.preprocess(
  (value) => (typeof value === 'string' ? value.replaceAll('_', '') : value),
  z.coerce.number().int().positive(),
);

const envRateLimit = z.coerce.number().int().positive();

const hmacKey = secret.refine(
  (value) => new TextEncoder().encode(value).byteLength >= 32,
  'HMAC keys must contain at least 32 bytes.',
);

const base64EncryptionKey = secret.refine(
  (value) => decodeBase64Bytes(value)?.byteLength === 32,
  'Encryption keys must be base64 for exactly 32 bytes.',
);

const quarantineRetentionDays = z.coerce.number().int().min(1).max(90);

const localProcessorCsrfSecret = hmacKey.parse(
  'local-dev-processor-csrf-key-32-bytes-minimum',
);
const localControlCsrfSecret = hmacKey.parse(
  'local-dev-control-csrf-key-32-bytes-minimum',
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
    API_CONTROL_MUTATION_RATE_LIMIT: envRateLimit.default(60),
    API_CONTROL_MUTATION_RATE_WINDOW_SECONDS: envRateLimit.default(60),
    API_INVITATION_ACCEPT_RATE_LIMIT: envRateLimit.default(10),
    API_INVITATION_ACCEPT_RATE_WINDOW_SECONDS: envRateLimit.default(900),

    AUTH_SECRET: secret,
    AUTH_SESSION_TTL_MINUTES: envInteger.default(43_200),
    AUTH_SESSION_IDLE_TIMEOUT_MINUTES: envInteger.default(10_080),
    AUTH_LOGIN_WINDOW_MINUTES: envInteger.default(15),
    AUTH_LOGIN_MAX_FAILURES: envInteger.default(8),
    AUTH_FRESH_SESSION_MAX_AGE_MINUTES: envInteger.default(15),
    AUTH_MFA_CHALLENGE_TTL_MINUTES: envInteger.default(5),
    AUTH_MFA_CHALLENGE_MAX_ATTEMPTS: envInteger.default(8),
    AUTH_MFA_ENCRYPTION_KEY: secret,
    AUTH_MFA_ISSUER: z.string().min(1).default('Pressly'),

    PROCESSOR_ORIGIN: z.url().optional(),
    PROCESSOR_CSRF_SECRET: hmacKey.optional(),
    CONTROL_ORIGIN: z.url().optional(),
    CONTROL_CSRF_SECRET: hmacKey.optional(),

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
    SENTRY_DSN: envSentryDsn.optional(),
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

    if (env.NODE_ENV === 'production' && !env.SENTRY_ENABLED)
      context.addIssue({
        code: 'custom',
        path: ['SENTRY_ENABLED'],
        message: 'SENTRY_ENABLED must be true in production.',
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

    if (env.NODE_ENV === 'production' && env.CONTROL_ORIGIN === undefined)
      context.addIssue({
        code: 'custom',
        path: ['CONTROL_ORIGIN'],
        message: 'CONTROL_ORIGIN is required in production.',
      });

    if (
      env.NODE_ENV === 'production' &&
      env.CONTROL_ORIGIN !== undefined &&
      new URL(env.CONTROL_ORIGIN).protocol !== 'https:'
    )
      context.addIssue({
        code: 'custom',
        path: ['CONTROL_ORIGIN'],
        message: 'CONTROL_ORIGIN must use HTTPS in production.',
      });

    if (env.NODE_ENV === 'production' && env.CONTROL_CSRF_SECRET === undefined)
      context.addIssue({
        code: 'custom',
        path: ['CONTROL_CSRF_SECRET'],
        message: 'CONTROL_CSRF_SECRET is required in production.',
      });
  });

export const parseApiEnv = (
  environment: Readonly<Record<string, string | undefined>>,
) => {
  const parsed = parseEnv(apiEnvSchema, environment);

  return Object.freeze({
    nodeEnv: parsed.NODE_ENV,
    shutdownGracePeriodMs: parsed.SHUTDOWN_GRACE_PERIOD_MS,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    databaseUrl: parsed.DATABASE_URL,
    databaseMaxConnections: parsed.DATABASE_MAX_CONNECTIONS,
    corsOrigin: parsed.CORS_ORIGIN,
    rateLimits: {
      global: {
        limit: parsed.API_GLOBAL_RATE_LIMIT,
        windowMs: parsed.API_GLOBAL_RATE_WINDOW_SECONDS * 1_000,
      },
      login: {
        limit: parsed.API_LOGIN_RATE_LIMIT,
        windowMs: parsed.API_LOGIN_RATE_WINDOW_SECONDS * 1_000,
      },
      controlMutation: {
        limit: parsed.API_CONTROL_MUTATION_RATE_LIMIT,
        windowMs: parsed.API_CONTROL_MUTATION_RATE_WINDOW_SECONDS * 1_000,
      },
      invitationAccept: {
        limit: parsed.API_INVITATION_ACCEPT_RATE_LIMIT,
        windowMs: parsed.API_INVITATION_ACCEPT_RATE_WINDOW_SECONDS * 1_000,
      },
    },
    auth: {
      secret: parsed.AUTH_SECRET,
      sessionTtlMinutes: parsed.AUTH_SESSION_TTL_MINUTES,
      sessionIdleTimeoutMinutes: parsed.AUTH_SESSION_IDLE_TIMEOUT_MINUTES,
      loginWindowMinutes: parsed.AUTH_LOGIN_WINDOW_MINUTES,
      loginMaxFailures: parsed.AUTH_LOGIN_MAX_FAILURES,
      freshSessionMaxAgeMinutes: parsed.AUTH_FRESH_SESSION_MAX_AGE_MINUTES,
      mfaChallengeTtlMinutes: parsed.AUTH_MFA_CHALLENGE_TTL_MINUTES,
      mfaChallengeMaxAttempts: parsed.AUTH_MFA_CHALLENGE_MAX_ATTEMPTS,
      mfaEncryptionKey: parsed.AUTH_MFA_ENCRYPTION_KEY,
      mfaIssuer: parsed.AUTH_MFA_ISSUER,
    },
    processor: {
      origin: new URL(parsed.PROCESSOR_ORIGIN ?? 'http://localhost:4173')
        .origin,
      csrfSecret: parsed.PROCESSOR_CSRF_SECRET ?? localProcessorCsrfSecret,
    },
    control: {
      origin: new URL(parsed.CONTROL_ORIGIN ?? 'http://localhost:4174').origin,
      csrfSecret: parsed.CONTROL_CSRF_SECRET ?? localControlCsrfSecret,
    },
    centsWebhook: {
      authMode: parsed.CENTS_WEBHOOK_AUTH_MODE,
      hmac: {
        currentKey: parsed.CENTS_WEBHOOK_HMAC_CURRENT_KEY,
        previousKey: parsed.CENTS_WEBHOOK_HMAC_PREVIOUS_KEY,
        clockWindowSeconds: parsed.CENTS_WEBHOOK_CLOCK_WINDOW_SECONDS,
      },
      quarantine: {
        encryptionKey: parsed.CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY,
        retentionMs:
          parsed.CENTS_WEBHOOK_QUARANTINE_RETENTION_DAYS * 24 * 60 * 60 * 1_000,
      },
    },
    features: {
      metricsEnabled: parsed.FEATURE_METRICS_ENABLED,
      jobsEnabled: parsed.FEATURE_JOBS_ENABLED,
    },
    observability: {
      sentry: {
        enabled: parsed.SENTRY_ENABLED,
        dsn: parsed.SENTRY_DSN,
        release: parsed.SENTRY_RELEASE,
        traceSampleRate: parsed.SENTRY_TRACES_SAMPLE_RATE,
      },
    },
  } as const);
};

export type ApiEnv = ReturnType<typeof parseApiEnv>;
