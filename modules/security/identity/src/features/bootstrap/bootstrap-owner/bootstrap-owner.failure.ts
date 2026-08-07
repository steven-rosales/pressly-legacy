import type { PasswordStrengthViolation } from '@pressly/auth/credentials';

export type BootstrapOwnerFailure =
  | Readonly<{
      kind: 'validation';
      code:
        | 'missing_bootstrap_owner_email'
        | 'invalid_bootstrap_owner_email'
        | 'invalid_bootstrap_owner_confirmation';
      message: string;
    }>
  | Readonly<{
      kind: 'validation';
      code: 'weak_bootstrap_owner_password';
      message: string;
      violations: readonly PasswordStrengthViolation[];
    }>
  | Readonly<{
      kind: 'conflict';
      code:
        | 'owner_already_bootstrapped'
        | 'bootstrap_owner_identity_already_exists';
      message: string;
    }>;

export const bootstrapOwnerFailure = Object.freeze({
  missingEmail: (): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'missing_bootstrap_owner_email',
    message: 'Owner email is required.',
  }),
  invalidEmail: (): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'invalid_bootstrap_owner_email',
    message: 'Owner email is invalid.',
  }),
  invalidConfirmation: (): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'invalid_bootstrap_owner_confirmation',
    message: 'Owner bootstrap confirmation is invalid.',
  }),
  weakPassword: (
    violations: readonly PasswordStrengthViolation[],
  ): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'weak_bootstrap_owner_password',
    message: 'Owner password is too weak.',
    violations,
  }),
  ownerExists: (): BootstrapOwnerFailure => ({
    kind: 'conflict',
    code: 'owner_already_bootstrapped',
    message: 'Owner bootstrap has already been completed.',
  }),
  identityExists: (): BootstrapOwnerFailure => ({
    kind: 'conflict',
    code: 'bootstrap_owner_identity_already_exists',
    message: 'Owner email already exists.',
  }),
});
