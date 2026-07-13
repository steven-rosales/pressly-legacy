import { makeAppError } from '@pressly/errors';

export const invalidMfaChallenge = () =>
  makeAppError({
    kind: 'AuthError',
    code: 'invalid_mfa_challenge',
    message: 'MFA challenge is invalid or already consumed.',
    safeMessage: 'The MFA challenge is invalid. Sign in again.',
    status: 401,
  });

export const expiredMfaChallenge = () =>
  makeAppError({
    kind: 'AuthError',
    code: 'expired_mfa_challenge',
    message: 'MFA challenge has expired.',
    safeMessage: 'The MFA challenge expired. Sign in again.',
    status: 401,
  });

export const invalidMfaCode = () =>
  makeAppError({
    kind: 'AuthError',
    code: 'invalid_mfa_code',
    message: 'MFA code is invalid or has already been used.',
    safeMessage: 'The MFA code is invalid.',
    status: 401,
  });

export const mfaAlreadyEnabled = () =>
  makeAppError({
    kind: 'ConflictError',
    code: 'mfa_already_enabled',
    message: 'MFA is already enabled for this identity.',
    safeMessage: 'MFA is already enabled.',
    status: 409,
  });

export const mfaEnrollmentMissing = () =>
  makeAppError({
    kind: 'ConflictError',
    code: 'mfa_enrollment_missing',
    message: 'No pending MFA enrollment exists.',
    safeMessage: 'Start MFA enrollment before confirming it.',
    status: 409,
  });
