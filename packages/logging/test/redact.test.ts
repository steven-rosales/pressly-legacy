import { describe, expect, it } from 'vitest';
import { makeAppError } from '@pressly/errors/app-error';
import { isSensitiveKey, redactLogFields } from '../src/redact.js';

describe('redactLogFields', () => {
  it('detects sensitive keys', () => {
    expect(isSensitiveKey('password')).toBe(true);
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('DATABASE_URL')).toBe(true);
    expect(isSensitiveKey('mfaEncryptionKey')).toBe(true);
    expect(isSensitiveKey('recoveryCodes')).toBe(true);
    expect(isSensitiveKey('safeField')).toBe(false);
  });

  it('redacts nested sensitive values', () => {
    const result = redactLogFields({
      email: 'user@example.com',
      token: 'secret-token',
      nested: {
        databaseUrl: 'postgres://secret',
      },
    });

    expect(result).toEqual({
      email: 'user@example.com',
      token: '[REDACTED]',
      nested: {
        databaseUrl: '[REDACTED]',
      },
    });
  });

  it('serializes errors safely', () => {
    const result = redactLogFields(new Error('boom'));

    expect(typeof result).toBe('object');
    expect((result as { message: string }).message).toBe('boom');
  });

  it('retains structured AppError identity and redacts its diagnostics', () => {
    const result = redactLogFields(
      makeAppError({
        kind: 'DatabaseError',
        code: 'database_unavailable',
        message: 'failed postgres://user:password@database/pressly',
        safeMessage: 'Storage is unavailable.',
        status: 503,
        details: { token: 'private-token', query: 'select 1' },
        cause: new Error('socket failed'),
      }),
    );

    expect(result).toMatchObject({
      tag: 'AppError',
      kind: 'DatabaseError',
      code: 'database_unavailable',
      status: 503,
      details: { token: '[REDACTED]', query: 'select 1' },
      cause: { name: 'Error', message: 'socket failed' },
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it('redacts nested credentials, bearer values, and URL passwords', () => {
    const result = redactLogFields({
      requestBody: { password: 'raw-password' },
      mfaEnrollmentSecret: 'raw-mfa-secret',
      recoveryCode: 'raw-recovery-code',
      nested: [
        { authorization: 'Bearer raw-token' },
        { message: 'failed postgres://user:password@postgres:5432/pressly' },
      ],
      error: new Error('request used Bearer another-token'),
    });

    expect(result).toEqual({
      requestBody: '[REDACTED]',
      mfaEnrollmentSecret: '[REDACTED]',
      recoveryCode: '[REDACTED]',
      nested: [
        { authorization: '[REDACTED]' },
        { message: 'failed postgres://[REDACTED]@postgres:5432/pressly' },
      ],
      error: {
        name: 'Error',
        message: 'request used Bearer [REDACTED]',
        stack: (result as { error: { stack?: string } }).error.stack,
      },
    });
  });
});
