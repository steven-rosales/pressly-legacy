import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  configError,
  invariantViolationError,
} from '@pressly/errors/factories';

export type SecretBox = Readonly<{
  encrypt: (plainText: string) => string;
  decrypt: (envelope: string) => string;
}>;

export type BinarySecretBox = Readonly<{
  encrypt: (plainText: Uint8Array) => string;
  decrypt: (envelope: string) => Uint8Array;
}>;

export type BinarySecretBoxOptions = Readonly<{
  additionalAuthenticatedData?: Uint8Array;
}>;

export type SecretBoxFailures = Readonly<{
  invalidKey: () => Error;
  invalidEnvelope: () => Error;
}>;

const neutralFailures: SecretBoxFailures = Object.freeze({
  invalidKey: () =>
    configError({
      code: 'invalid_secret_box_key',
      message: 'Secret-box key must decode to exactly 32 bytes.',
      safeMessage: 'Secret encryption is misconfigured.',
    }),
  invalidEnvelope: () =>
    invariantViolationError({
      code: 'invalid_secret_box_envelope',
      message: 'Stored secret-box envelope is invalid.',
    }),
});

export const makeBinarySecretBox = (
  base64Key: string,
  options: BinarySecretBoxOptions = {},
  failures: SecretBoxFailures = neutralFailures,
): BinarySecretBox => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw failures.invalidKey();

  return {
    encrypt(plainText) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      if (options.additionalAuthenticatedData !== undefined)
        cipher.setAAD(options.additionalAuthenticatedData);
      const encrypted = Buffer.concat([
        cipher.update(plainText),
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
        throw failures.invalidEnvelope();

      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(ivValue, 'base64url'),
      );
      if (options.additionalAuthenticatedData !== undefined)
        decipher.setAAD(options.additionalAuthenticatedData);
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return new Uint8Array(
        Buffer.concat([
          decipher.update(Buffer.from(encryptedValue, 'base64url')),
          decipher.final(),
        ]),
      );
    },
  };
};

export const makeSecretBox = (
  base64Key: string,
  failures: SecretBoxFailures = neutralFailures,
): SecretBox => {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw failures.invalidKey();

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
        throw failures.invalidEnvelope();

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
