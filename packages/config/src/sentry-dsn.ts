import { z } from 'zod';

const sentryProjectId = /^\d+$/;
const sentryDsnSyntax =
  /^https?:\/\/\w+@(?:\[[:.%\w]+\]|[\w.-]+)(?::\d+)?\/.+$/;

export const isSentryDsn = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  if (value.trim() !== value || !sentryDsnSyntax.test(value)) return false;

  const dsn = URL.parse(value);
  if (dsn === null) return false;

  const projectId = dsn.pathname.split('/').at(-1);

  return (
    (dsn.protocol === 'https:' || dsn.protocol === 'http:') &&
    dsn.username.length > 0 &&
    dsn.password.length === 0 &&
    dsn.hostname.length > 0 &&
    projectId !== undefined &&
    sentryProjectId.test(projectId) &&
    dsn.search.length === 0 &&
    dsn.hash.length === 0
  );
};

export const envSentryDsn = z
  .string()
  .refine(isSentryDsn, 'Must be a valid Sentry DSN.');
