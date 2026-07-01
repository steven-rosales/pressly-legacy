import { describe, expect, it } from 'vitest';
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
