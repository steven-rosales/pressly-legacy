import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';

export const CENTS_WEBHOOK_ADAPTER_VERSION = 'cents-webhook-v1';

const additionalAuthenticatedData = Buffer.from(
  'pressly:cents-webhook-quarantine:v1',
  'utf8',
);

export type CentsWebhookPayloadCipher = Readonly<{
  encrypt: (rawBody: Buffer) => string;
  decrypt: (envelope: string) => Buffer;
}>;

const invalidKey = () =>
  configError({
    code: 'invalid_cents_webhook_quarantine_encryption_key',
    message:
      'CENTS_WEBHOOK_QUARANTINE_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    safeMessage: 'Cents webhook quarantine encryption is misconfigured.',
  });

export const makeCentsWebhookPayloadCipher = (
  base64Key: string,
): CentsWebhookPayloadCipher => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw invalidKey();

  return {
    encrypt(rawBody) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(additionalAuthenticatedData);
      const encrypted = Buffer.concat([cipher.update(rawBody), cipher.final()]);
      return [
        'v1',
        iv.toString('base64url'),
        encrypted.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
      ].join('.');
    },

    decrypt(envelope) {
      const [version, ivValue, encryptedValue, tagValue] = envelope.split('.');
      if (
        version !== 'v1' ||
        ivValue === undefined ||
        encryptedValue === undefined ||
        tagValue === undefined
      )
        throw invariantViolationError({
          code: 'invalid_cents_webhook_quarantine_envelope',
          message: 'Stored Cents webhook quarantine envelope is invalid.',
        });

      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAAD(additionalAuthenticatedData);
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]);
    },
  };
};
