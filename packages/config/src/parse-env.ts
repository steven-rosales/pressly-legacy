import type { z } from 'zod';
import type { EnvSource } from './env-source.js';
import { configError } from '@pressly/errors';

export type ParsedEnv<S extends z.ZodType> = Readonly<z.infer<S>>;

export const parseEnv = <S extends z.ZodType>(
  schema: S,
  source: EnvSource,
): ParsedEnv<S> => {
  const result = schema.safeParse(source);

  if (result.success) return Object.freeze(result.data);

  const messages = result.error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });

  throw configError({
    code: 'invalid_environment',
    message: 'Invalid environment configuration.',
    safeMessage: 'Server configuration is invalid.',
    details: {
      issues: messages,
    },
    cause: result.error,
  });
};
