export type MfaFailure =
  | Readonly<{
      kind: 'authentication';
      code:
        | 'invalid_mfa_challenge'
        | 'expired_mfa_challenge'
        | 'invalid_mfa_code';
      message: string;
    }>
  | Readonly<{
      kind: 'conflict';
      code: 'mfa_already_enabled' | 'mfa_enrollment_missing';
      message: string;
    }>;

export const mfaFailure = Object.freeze({
  invalidChallenge: (): MfaFailure => ({
    kind: 'authentication',
    code: 'invalid_mfa_challenge',
    message: 'The MFA challenge is invalid. Sign in again.',
  }),
  expiredChallenge: (): MfaFailure => ({
    kind: 'authentication',
    code: 'expired_mfa_challenge',
    message: 'The MFA challenge expired. Sign in again.',
  }),
  invalidCode: (): MfaFailure => ({
    kind: 'authentication',
    code: 'invalid_mfa_code',
    message: 'The MFA code is invalid.',
  }),
  alreadyEnabled: (): MfaFailure => ({
    kind: 'conflict',
    code: 'mfa_already_enabled',
    message: 'MFA is already enabled.',
  }),
  enrollmentMissing: (): MfaFailure => ({
    kind: 'conflict',
    code: 'mfa_enrollment_missing',
    message: 'Start MFA enrollment before confirming it.',
  }),
});
