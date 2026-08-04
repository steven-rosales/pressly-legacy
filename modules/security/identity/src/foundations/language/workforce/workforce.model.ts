export type StoreFailureReason =
  | 'actor_inactive'
  | 'actor_membership_inactive'
  | 'insufficient_assurance'
  | 'outside_business'
  | 'outside_location'
  | 'manager_target_forbidden'
  | 'self_access_change'
  | 'last_owner'
  | 'not_found'
  | 'stale_version'
  | 'invalid_state'
  | 'email_conflict'
  | 'authentication_required'
  | 'wrong_authenticated_identity'
  | 'invalid_token'
  | 'expired_token'
  | 'idempotency_conflict';

export const workforceRoles = ['owner', 'manager', 'operator'] as const;

export type WorkforceRole = (typeof workforceRoles)[number];

export type WorkforceScope =
  | Readonly<{ kind: 'business'; id: string }>
  | Readonly<{ kind: 'location'; id: string }>;

export type WorkforceActorRef = Readonly<{
  identityId: string;
  sessionId: string;
}>;

export type StoreMutationResult<T> =
  | Readonly<{ status: 'applied'; value: T }>
  | Readonly<{ status: 'replayed'; value: T }>
  | Readonly<{
      status: 'rejected';
      reason: StoreFailureReason;
      currentVersion?: number;
    }>;
