type MfaAuthenticationFailure<Code extends string> = Readonly<{
  kind: 'authentication';
  code: Code;
  message: string;
}>;

type MfaConflictFailure<Code extends string> = Readonly<{
  kind: 'conflict';
  code: Code;
  message: string;
}>;

export type MfaFailure =
  | MfaAuthenticationFailure<'invalid_mfa_challenge'>
  | MfaAuthenticationFailure<'expired_mfa_challenge'>
  | MfaAuthenticationFailure<'invalid_mfa_code'>
  | MfaConflictFailure<'mfa_already_enabled'>
  | MfaConflictFailure<'mfa_enrollment_missing'>;

export const mfaFailure = Object.freeze({
  invalidChallenge: (): MfaAuthenticationFailure<'invalid_mfa_challenge'> => ({
    kind: 'authentication',
    code: 'invalid_mfa_challenge',
    message: 'The MFA challenge is invalid. Sign in again.',
  }),
  expiredChallenge: (): MfaAuthenticationFailure<'expired_mfa_challenge'> => ({
    kind: 'authentication',
    code: 'expired_mfa_challenge',
    message: 'The MFA challenge expired. Sign in again.',
  }),
  invalidCode: (): MfaAuthenticationFailure<'invalid_mfa_code'> => ({
    kind: 'authentication',
    code: 'invalid_mfa_code',
    message: 'The MFA code is invalid.',
  }),
  alreadyEnabled: (): MfaConflictFailure<'mfa_already_enabled'> => ({
    kind: 'conflict',
    code: 'mfa_already_enabled',
    message: 'MFA is already enabled.',
  }),
  enrollmentMissing: (): MfaConflictFailure<'mfa_enrollment_missing'> => ({
    kind: 'conflict',
    code: 'mfa_enrollment_missing',
    message: 'Start MFA enrollment before confirming it.',
  }),
});
