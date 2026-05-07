import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSensitiveKey, redactLogFields } from './redact.js';

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
});
