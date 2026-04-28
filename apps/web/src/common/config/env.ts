import { z } from 'zod';
import { envUrl, nodeEnvSchema, parseEnv, featureFlag } from '@pressly/config';

const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('dev'),

  NEXT_PUBLIC_API_BASE_URL: envUrl.default('http://localhost:3000'),

  NEXT_PUBLIC_ANALYTICS_ENABLED: featureFlag,

  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: envUrl.default('https://us.i.posthog.com'),
});

const rawWebEnv = parseEnv(webEnvSchema, process.env);

export type WebEnv = typeof rawWebEnv;

export const webEnv = {
  nodeEnv: rawWebEnv.NODE_ENV,
  apiBaseUrl: rawWebEnv.NEXT_PUBLIC_API_BASE_URL,
  observability: {
    sentry: { dsn: rawWebEnv.NEXT_PUBLIC_SENTRY_DSN },
    postHog: {
      key: rawWebEnv.NEXT_PUBLIC_POSTHOG_KEY,
      host: rawWebEnv.NEXT_PUBLIC_POSTHOG_HOST,
    },
  },
} as const;
