import { z } from 'zod';
import { envBoolean, envUrl, nodeEnvSchema, parseEnv } from '@pressly/config';

const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  NEXT_PUBLIC_API_BASE_URL: envUrl.default('http://localhost:3000'),

  NEXT_PUBLIC_ANALYTICS_ENABLED: envBoolean.optional(),

  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),

  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: envUrl.default('https://us.i.posthog.com'),
});

const rawWebEnv = parseEnv(webEnvSchema, {
  NODE_ENV: process.env['NODE_ENV'],
  NEXT_PUBLIC_API_BASE_URL: process.env['NEXT_PUBLIC_API_BASE_URL'],
  NEXT_PUBLIC_ANALYTICS_ENABLED: process.env['NEXT_PUBLIC_ANALYTICS_ENABLED'],
  NEXT_PUBLIC_SENTRY_DSN: process.env['NEXT_PUBLIC_SENTRY_DSN'],
  NEXT_PUBLIC_POSTHOG_KEY: process.env['NEXT_PUBLIC_POSTHOG_KEY'],
  NEXT_PUBLIC_POSTHOG_HOST: process.env['NEXT_PUBLIC_POSTHOG_HOST'],
});

export type WebEnv = typeof rawWebEnv;

export const webEnv = {
  nodeEnv: rawWebEnv.NODE_ENV,
  apiBaseUrl: rawWebEnv.NEXT_PUBLIC_API_BASE_URL,
  analyticsEnabled:
    rawWebEnv.NEXT_PUBLIC_ANALYTICS_ENABLED ??
    Boolean(rawWebEnv.NEXT_PUBLIC_POSTHOG_KEY),
  observability: {
    sentry: { dsn: rawWebEnv.NEXT_PUBLIC_SENTRY_DSN },
    posthog: {
      key: rawWebEnv.NEXT_PUBLIC_POSTHOG_KEY,
      host: rawWebEnv.NEXT_PUBLIC_POSTHOG_HOST,
    },
  },
} as const;
