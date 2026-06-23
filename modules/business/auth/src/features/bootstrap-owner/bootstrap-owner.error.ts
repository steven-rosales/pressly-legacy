import type { PasswordStrengthViolation } from '@pressly/auth/credentials';
import { conflictError, validationError } from '@pressly/errors';

export const missingBootstrapOwnerEmail = () =>
  validationError({
    code: 'missing_bootstrap_owner_email',
    message: 'Owner bootstrap email is required.',
    safeMessage: 'Owner email is required.',
  });

export const invalidBootstrapOwnerEmail = () =>
  validationError({
    code: 'invalid_bootstrap_owner_email',
    message: 'Owner bootstrap email is invalid.',
    safeMessage: 'Owner email is invalid.',
  });

export const invalidBootstrapOwnerConfirmation = () =>
  validationError({
    code: 'invalid_bootstrap_owner_confirmation',
    message: 'Owner bootstrap confirmation is invalid.',
    safeMessage: 'Owner bootstrap confirmation is invalid.',
  });

export const weakBootstrapOwnerPassword = (
  violations: readonly PasswordStrengthViolation[],
) =>
  validationError({
    code: 'weak_bootstrap_owner_password',
    message: 'Owner bootstrap password does not meet strength requirements.',
    safeMessage: 'Owner password is too weak.',
    details: { violations },
  });

export const ownerAlreadyBootstrapped = () =>
  conflictError({
    code: 'owner_already_bootstrapped',
    message: 'An owner identity already exists.',
    safeMessage: 'Owner bootstrap has already been completed.',
  });

export const bootstrapOwnerIdentityAlreadyExists = () =>
  conflictError({
    code: 'bootstrap_owner_identity_already_exists',
    message: 'Owner bootstrap email already belongs to an identity.',
    safeMessage: 'Owner email already exists.',
  });
