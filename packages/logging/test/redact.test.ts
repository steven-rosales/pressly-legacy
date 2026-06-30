import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSensitiveKey, redactLogFields } from '../src/redact.js';

describe('redactLogFields', () => {
  it('detects sensitive keys', () => {
    assert.equal(isSensitiveKey('password'), true);
    assert.equal(isSensitiveKey('apiKey'), true);
    assert.equal(isSensitiveKey('DATABASE_URL'), true);
    assert.equal(isSensitiveKey('safeField'), false);
  });

  it('redacts nested sensitive values', () => {
    const result = redactLogFields({
      email: 'user@example.com',
      token: 'secret-token',
      nested: {
        databaseUrl: 'postgres://secret',
      },
    });

    assert.deepEqual(result, {
      email: 'user@example.com',
      token: '[REDACTED]',
      nested: {
        databaseUrl: '[REDACTED]',
      },
    });
  });

  it('serializes errors safely', () => {
    const result = redactLogFields(new Error('boom'));

    assert.equal(typeof result, 'object');
    assert.equal((result as { message: string }).message, 'boom');
  });

  it('redacts nested credentials, bearer values, and URL passwords', () => {
    const result = redactLogFields({
      requestBody: { password: 'raw-password' },
      nested: [
        { authorization: 'Bearer raw-token' },
        { message: 'failed postgres://user:password@postgres:5432/pressly' },
      ],
      error: new Error('request used Bearer another-token'),
    });

    assert.deepEqual(result, {
      requestBody: '[REDACTED]',
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
