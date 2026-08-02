import type { AccessGrantState } from './access-grant.policy.ts';
import type { WorkforceInvitationState } from './workforce-invitation.policy.ts';
import type { WorkforceMembershipState } from './workforce-membership.policy.ts';

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

export type WorkforceInvitationSummary = Readonly<{
  id: string;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  state: WorkforceInvitationState;
  version: number;
  expiresAt: Date;
  createdAt: Date;
}>;

export type WorkforceInvitationPreview = Readonly<{
  invitationId: string;
  businessId: string;
  businessName: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  expiresAt: Date;
  existingIdentity: boolean;
}>;

export type AccessGrantSummary = Readonly<{
  id: string;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: WorkforceRole;
  scope: WorkforceScope;
  state: AccessGrantState;
  version: number;
  startsAt: Date | null;
  endsAt: Date | null;
  effective: boolean;
}>;

export type WorkforceMemberSummary = Readonly<{
  membershipId: string;
  businessId: string;
  identityId: string;
  displayName: string;
  email: string;
  state: WorkforceMembershipState;
  version: number;
  mfaEnabled: boolean;
  grants: readonly AccessGrantSummary[];
  startedAt: Date;
  suspendedAt: Date | null;
  endedAt: Date | null;
}>;

export type WorkforceMemberDetail = WorkforceMemberSummary &
  Readonly<{
    activeSessionCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type WorkforcePage = Readonly<{
  members: readonly WorkforceMemberSummary[];
  nextCursor: string | null;
}>;

export type StoreMutationResult<T> =
  | Readonly<{ status: 'applied'; value: T }>
  | Readonly<{ status: 'replayed'; value: T }>
  | Readonly<{
      status: 'rejected';
      reason: StoreFailureReason;
      currentVersion?: number;
    }>;
