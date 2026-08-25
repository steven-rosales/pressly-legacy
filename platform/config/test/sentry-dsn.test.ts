import { describe, expect, it } from 'vitest';
import { envSentryDsn, isSentryDsn } from '../src/sentry-dsn.js';

describe('Sentry DSN', () => {
  it.each([
    'https://public@example.com/1',
    'https://public@example.com/sentry/42',
    'http://public@localhost:9000/7',
    'http://public@[::1]:9000/7',
  ])('accepts %s', (dsn) => {
    expect(isSentryDsn(dsn)).toBe(true);
    expect(envSentryDsn.safeParse(dsn).success).toBe(true);
  });

  it.each([
    undefined,
    'not-a-url',
    'https://example.com/1',
    'https://public@example.com',
    'https://public@example.com/project',
    'ftp://public@example.com/1',
    'https://public@example.com/1?token=private',
    ' https://public@example.com/1',
    'https://public@example.com/1 ',
    'https://public@example.com/1/',
    'https://public:private-key@example.com/1',
  ])('rejects %s', (dsn) => {
    expect(isSentryDsn(dsn)).toBe(false);
    expect(envSentryDsn.safeParse(dsn).success).toBe(false);
  });
});
