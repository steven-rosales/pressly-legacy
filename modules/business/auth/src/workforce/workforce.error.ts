import {
  authError,
  conflictError,
  notFoundError,
  permissionError,
  validationError,
  type AppError,
} from '@pressly/errors';
import type { StoreFailureReason } from './workforce.model.ts';

export const weakInvitationPassword = (
  violations: readonly string[],
): AppError =>
  validationError({
    code: 'weak_invitation_password',
    message: 'Invitation password does not meet strength requirements.',
    safeMessage: 'Choose a stronger password.',
    publicDetails: { violations },
  });

const permissionFailure = (reason: StoreFailureReason): AppError =>
  permissionError({
    code: `workforce_${reason}`,
    message: `Workforce command was denied: ${reason}.`,
    safeMessage:
      reason === 'insufficient_assurance'
        ? 'Complete multi-factor authentication before changing team access.'
        : 'You do not have permission to change this team access.',
  });

export const workforceStoreFailure = (
  reason: StoreFailureReason,
  currentVersion?: number,
): AppError => {
  if (
    reason === 'actor_inactive' ||
    reason === 'actor_membership_inactive' ||
    reason === 'insufficient_assurance' ||
    reason === 'outside_business' ||
    reason === 'outside_location' ||
    reason === 'manager_target_forbidden' ||
    reason === 'self_access_change'
  )
    return permissionFailure(reason);

  if (reason === 'not_found' || reason === 'invalid_token')
    return notFoundError({
      code:
        reason === 'invalid_token'
          ? 'workforce_invitation_not_found'
          : 'workforce_record_not_found',
      message: `Workforce record was not found: ${reason}.`,
      safeMessage: 'This workforce record is not available.',
    });

  if (reason === 'authentication_required')
    return authError({
      code: 'invitation_identity_authentication_required',
      message:
        'Invitation email already belongs to an identity that must authenticate.',
      safeMessage: 'Sign in with the invited email before accepting.',
    });

  if (reason === 'wrong_authenticated_identity')
    return permissionError({
      code: 'invitation_identity_mismatch',
      message:
        'Authenticated identity does not match the invitation email identity.',
      safeMessage: 'Sign in with the email address that received this invite.',
    });

  const safeMessage: Record<
    Exclude<
      StoreFailureReason,
      | 'actor_inactive'
      | 'actor_membership_inactive'
      | 'insufficient_assurance'
      | 'outside_business'
      | 'outside_location'
      | 'manager_target_forbidden'
      | 'self_access_change'
      | 'not_found'
      | 'invalid_token'
      | 'authentication_required'
      | 'wrong_authenticated_identity'
    >,
    string
  > = {
    last_owner: 'Another active owner is required before making this change.',
    stale_version: 'Team access changed. Refresh and try again.',
    invalid_state: 'This workforce action is no longer available.',
    email_conflict: 'An active invitation already exists for this email.',
    expired_token: 'This invitation has expired.',
    idempotency_conflict:
      'This request identifier was already used for a different change.',
  };

  return conflictError({
    code: `workforce_${reason}`,
    message: `Workforce command conflicts with current state: ${reason}.`,
    safeMessage: safeMessage[reason],
    ...(currentVersion === undefined
      ? {}
      : { publicDetails: { currentVersion } }),
  });
};
