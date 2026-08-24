import {
  makePasswordHasher,
  makePasswordVerifier,
} from '@pressly/auth-platform/passwords';
import { makeSecretBox } from '@pressly/auth-platform/secret-box';
import { unexpectedError } from '@pressly/errors/factories';
import { describe, expect, it } from 'vitest';
import {
  invalidEncryptedSecretEnvelope,
  invalidMfaEncryptionKey,
  passwordHashingFailed,
  passwordVerificationFailed,
} from './credential-mechanism-failures.ts';

const fault = () =>
  unexpectedError({
    code: 'synthetic_credential_fault',
    message: 'Synthetic credential fault.',
  });

describe('Access credential mechanism failures', () => {
  it('maps password hashing and verification failures to legacy-safe data', async () => {
    const cause = fault();
    await expect(
      makePasswordHasher({
        hashPassword: async () => Promise.reject(cause),
        hashFailure: passwordHashingFailed,
      }).hash('CorrectHorse1!Battery'),
    ).rejects.toMatchObject({
      code: 'password_hashing_failed',
      message: 'Password hashing failed.',
      safeMessage: 'Password could not be saved.',
      cause,
    });
    await expect(
      makePasswordVerifier({
        verifyPassword: async () => Promise.reject(cause),
        verificationFailure: passwordVerificationFailed,
      }).verify('hash', 'CorrectHorse1!Battery'),
    ).rejects.toMatchObject({
      code: 'password_verification_failed',
      message: 'Password verification failed.',
      safeMessage: 'Invalid email or password.',
      cause,
    });
  });

  it('maps secret configuration and malformed envelopes to legacy failure data', () => {
    const failures = {
      invalidKey: invalidMfaEncryptionKey,
      invalidEnvelope: invalidEncryptedSecretEnvelope,
    };
    expect(() => makeSecretBox('invalid', failures)).toThrow(
      expect.objectContaining({
        code: 'invalid_mfa_encryption_key',
        message: 'AUTH_MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.',
        safeMessage: 'MFA encryption is misconfigured.',
      }),
    );
    const key = Buffer.alloc(32, 1).toString('base64');
    expect(() => makeSecretBox(key, failures).decrypt('invalid')).toThrow(
      expect.objectContaining({
        code: 'invalid_encrypted_secret_envelope',
        message: 'Stored encrypted secret envelope is invalid.',
      }),
    );
  });
});
