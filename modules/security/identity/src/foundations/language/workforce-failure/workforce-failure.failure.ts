import type { StoreFailureReason } from '../workforce/workforce.model.ts';

export type WorkforceFailure = Readonly<{
  kind:
    | 'validation'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict';
  code: string;
  message: string;
  details?: Readonly<{
    field?: string;
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;

export const invalidWorkforceInputFailure = (
  field: string,
): WorkforceFailure => ({
  kind: 'validation',
  code: `invalid_workforce_${field}`,
  message: 'Review the highlighted workforce information.',
  details: { field },
});

export const weakInvitationPassword = (
  violations: readonly string[],
): WorkforceFailure => ({
  kind: 'validation',
  code: 'weak_invitation_password',
  message: 'Choose a stronger password.',
  details: { violations },
});

const permissionFailure = (reason: StoreFailureReason): WorkforceFailure => ({
  kind: 'permission',
  code: `workforce_${reason}`,
  message:
    reason === 'insufficient_assurance'
      ? 'Complete multi-factor authentication before changing team access.'
      : 'You do not have permission to change this team access.',
});

const conflictMessage: Readonly<
  Record<
    | 'last_owner'
    | 'stale_version'
    | 'invalid_state'
    | 'email_conflict'
    | 'expired_token'
    | 'idempotency_conflict',
    string
  >
> = {
  last_owner: 'Another active owner is required before making this change.',
  stale_version: 'Team access changed. Refresh and try again.',
  invalid_state: 'This workforce action is no longer available.',
  email_conflict: 'An active invitation already exists for this email.',
  expired_token: 'This invitation has expired.',
  idempotency_conflict:
    'This request identifier was already used for a different change.',
};

export const workforceStoreFailure = (
  reason: StoreFailureReason,
  currentVersion?: number,
): WorkforceFailure => {
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
    return {
      kind: 'not_found',
      code:
        reason === 'invalid_token'
          ? 'workforce_invitation_not_found'
          : 'workforce_record_not_found',
      message: 'This workforce record is not available.',
    };

  if (reason === 'authentication_required')
    return {
      kind: 'authentication',
      code: 'invitation_identity_authentication_required',
      message: 'Sign in with the invited email before accepting.',
    };

  if (reason === 'wrong_authenticated_identity')
    return {
      kind: 'permission',
      code: 'invitation_identity_mismatch',
      message: 'Sign in with the email address that received this invite.',
    };

  return {
    kind: 'conflict',
    code: `workforce_${reason}`,
    message: conflictMessage[reason],
    ...(currentVersion === undefined ? {} : { details: { currentVersion } }),
  };
};
