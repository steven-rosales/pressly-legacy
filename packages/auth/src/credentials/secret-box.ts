import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { configError, invariantViolationError } from '@pressly/errors';

export type SecretBox = Readonly<{
  encrypt: (plainText: string) => string;
  decrypt: (envelope: string) => string;
}>;

const invalidKey = () =>
  configError({
    code: 'invalid_mfa_encryption_key',
    message: 'AUTH_MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    safeMessage: 'MFA encryption is misconfigured.',
  });

export const makeSecretBox = (base64Key: string): SecretBox => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw invalidKey();

  return {
    encrypt(plainText) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(plainText, 'utf8'),
        cipher.final(),
      ]);

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
          code: 'invalid_encrypted_secret_envelope',
          message: 'Stored encrypted secret envelope is invalid.',
        });

      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
};
