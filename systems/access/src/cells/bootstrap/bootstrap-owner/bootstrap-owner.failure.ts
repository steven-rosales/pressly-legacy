import type { PasswordStrengthViolation } from '../../../model/language/password-strength.ts';

export type BootstrapOwnerFailure =
  | Readonly<{
      kind: 'validation';
      code:
        | 'missing_bootstrap_owner_email'
        | 'invalid_bootstrap_owner_email'
        | 'invalid_bootstrap_owner_confirmation'
        | 'invalid_bootstrap_business_slug'
        | 'invalid_bootstrap_business_display_name'
        | 'bootstrap_owner_password_too_long';
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
        | 'bootstrap_owner_identity_already_exists'
        | 'bootstrap_owner_business_conflict'
        | 'bootstrap_owner_credential_conflict';
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
  invalidBusinessSlug: (): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'invalid_bootstrap_business_slug',
    message: 'Business slug is invalid.',
  }),
  invalidBusinessDisplayName: (): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'invalid_bootstrap_business_display_name',
    message: 'Business display name is invalid.',
  }),
  passwordTooLong: (): BootstrapOwnerFailure => ({
    kind: 'validation',
    code: 'bootstrap_owner_password_too_long',
    message: 'Owner password is too long.',
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
  businessConflict: (): BootstrapOwnerFailure => ({
    kind: 'conflict',
    code: 'bootstrap_owner_business_conflict',
    message: 'Bootstrap business facts conflict with the existing business.',
  }),
  credentialConflict: (): BootstrapOwnerFailure => ({
    kind: 'conflict',
    code: 'bootstrap_owner_credential_conflict',
    message: 'Owner bootstrap password does not match the existing owner.',
  }),
});
