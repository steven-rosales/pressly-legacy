import { envUrl, nodeEnvSchema, parseEnv } from '@pressly/config';
import { z } from 'zod';

const webEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('dev'),

  NEXT_PUBLIC_API_BASE_URL: envUrl.default('http://localhost:4000'),
});

const rawWebEnv = parseEnv(webEnvSchema, process.env);

export type WebEnv = typeof rawWebEnv;

export const webEnv = {
  nodeEnv: rawWebEnv.NODE_ENV,
  apiBaseUrl: rawWebEnv.NEXT_PUBLIC_API_BASE_URL,
} as const;
