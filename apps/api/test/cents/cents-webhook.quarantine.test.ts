import { describe, expect, it } from 'vitest';
import { makeCentsWebhookPayloadCipher } from '../../src/http/webhooks/cents/cents-webhook.quarantine.ts';

const key = Buffer.alloc(32, 7).toString('base64');

describe('Cents webhook quarantine encryption', () => {
  it('encrypts exact raw bytes without leaving customer PII in storage', () => {
    const cipher = makeCentsWebhookPayloadCipher(key);
    const rawBody = Buffer.from(
      '{ "customer": { "email": "private@example.invalid" } }',
    );
    const encrypted = cipher.encrypt(rawBody);

    expect(encrypted).toMatch(/^v1\.[^.]+\.[^.]+\.[^.]+$/);
    expect(encrypted).not.toContain('private@example.invalid');
    expect(cipher.decrypt(encrypted)).toEqual(rawBody);
  });

  it('rejects keys that do not decode to exactly 32 bytes', () => {
    expect(() => makeCentsWebhookPayloadCipher('too-short')).toThrow(
      'CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY',
    );
  });

  it('detects ciphertext tampering', () => {
    const cipher = makeCentsWebhookPayloadCipher(key);
    const envelope = cipher.encrypt(Buffer.from('{"event":"order_updated"}'));
    const parts = envelope.split('.');
    parts[2] = `${parts[2]}a`;

    expect(() => cipher.decrypt(parts.join('.'))).toThrow();
  });
});
