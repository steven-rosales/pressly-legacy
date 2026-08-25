import {
  configError,
  invariantViolationError,
  unexpectedError,
} from '@pressly/errors/factories';

export const passwordHashingFailed = (cause: unknown) =>
  unexpectedError({
    code: 'password_hashing_failed',
    message: 'Password hashing failed.',
    safeMessage: 'Password could not be saved.',
    cause,
  });

export const passwordVerificationFailed = (cause: unknown) =>
  unexpectedError({
    code: 'password_verification_failed',
    message: 'Password verification failed.',
    safeMessage: 'Invalid email or password.',
    cause,
  });

export const invalidMfaEncryptionKey = () =>
  configError({
    code: 'invalid_mfa_encryption_key',
    message: 'AUTH_MFA_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    safeMessage: 'MFA encryption is misconfigured.',
  });

export const invalidEncryptedSecretEnvelope = () =>
  invariantViolationError({
    code: 'invalid_encrypted_secret_envelope',
    message: 'Stored encrypted secret envelope is invalid.',
  });
