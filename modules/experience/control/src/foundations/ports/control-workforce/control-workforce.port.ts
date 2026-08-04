import type { Result } from '@pressly/kernel';
import type {
  ControlInvitationPreviewSnapshot,
  ControlIssuedInvitation,
  ControlMembershipDetailSnapshot,
  ControlGrantRevocation,
  ControlSecurityEventList,
  ControlSessionRevocation,
  ControlMembershipTransition,
  ControlWorkforceSessionList,
  ControlAcceptedInvitation,
} from '../../language/control-workforce/control-workforce.model.ts';
import type {
  ControlGrantEntity,
  ControlInvitationEntity,
  ControlMembershipEntity,
} from '../../language/control-workforce/control-workforce.entity.ts';
import type {
  ControlActorReference,
  ControlMembershipState,
  ControlWorkforceRole,
  ControlWorkforceScope,
} from '../../language/control-workforce/control-workforce.value.ts';

export type ControlWorkforceRejection = Readonly<{
  kind: 'workforce_rejected';
  category:
    | 'validation'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict'
    | 'rate_limit';
  code: string;
  message: string;
  details?: Readonly<{
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;

type PeerResult<Value> = Promise<Result<Value, ControlWorkforceRejection>>;

export type ControlWorkforcePort = Readonly<{
  listMembers: (input: {
    actor: ControlActorReference;
    businessId: string;
    states?: readonly ControlMembershipState[];
    query?: string;
    cursor?: string;
    limit: number;
  }) => PeerResult<
    Readonly<{
      members: readonly ControlMembershipEntity[];
      nextCursor: string | null;
    }>
  >;
  getMember: (input: {
    actor: ControlActorReference;
    businessId: string;
    membershipId: string;
  }) => PeerResult<ControlMembershipDetailSnapshot>;
  listMemberSessions: (input: {
    actor: ControlActorReference;
    businessId: string;
    membershipId: string;
  }) => PeerResult<ControlWorkforceSessionList>;
  revokeMemberSessions: (input: {
    actor: ControlActorReference;
    businessId: string;
    membershipId: string;
    sessionId?: string;
    idempotencyKey: string;
  }) => PeerResult<ControlSessionRevocation>;
  listInvitations: (input: {
    actor: ControlActorReference;
    businessId: string;
    includeTerminal: boolean;
    cursor?: string;
    limit: number;
  }) => PeerResult<
    Readonly<{
      invitations: readonly ControlInvitationEntity[];
      nextCursor: string | null;
    }>
  >;
  issueInvitation: (input: {
    actor: ControlActorReference;
    businessId: string;
    email: string;
    displayName: string;
    intendedRole: ControlWorkforceRole;
    intendedLocationId: string | null;
    idempotencyKey: string;
  }) => PeerResult<ControlIssuedInvitation>;
  reissueInvitation: (input: {
    actor: ControlActorReference;
    businessId: string;
    invitationId: string;
    expectedVersion: number;
    idempotencyKey: string;
  }) => PeerResult<ControlIssuedInvitation>;
  revokeInvitation: (input: {
    actor: ControlActorReference;
    businessId: string;
    invitationId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  }) => PeerResult<ControlInvitationEntity>;
  transitionMembership: (input: {
    transition: 'suspend' | 'reactivate' | 'end';
    actor: ControlActorReference;
    businessId: string;
    membershipId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  }) => PeerResult<ControlMembershipTransition>;
  grantAccess: (input: {
    actor: ControlActorReference;
    businessId: string;
    membershipId: string;
    identityId: string;
    role: ControlWorkforceRole;
    scope: ControlWorkforceScope;
    startsAt?: Date;
    endsAt?: Date;
    idempotencyKey: string;
  }) => PeerResult<ControlGrantEntity>;
  revokeAccess: (input: {
    actor: ControlActorReference;
    businessId: string;
    grantId: string;
    expectedVersion: number;
    idempotencyKey: string;
    reason?: string;
  }) => PeerResult<ControlGrantRevocation>;
  previewInvitation: (
    acceptanceToken: string,
  ) => PeerResult<ControlInvitationPreviewSnapshot>;
  acceptInvitation: (input: {
    acceptanceToken: string;
    idempotencyKey: string;
    acceptance:
      | Readonly<{ kind: 'new_identity'; password: string }>
      | Readonly<{
          kind: 'existing_identity';
          authenticatedIdentityId: string;
          authenticatedSessionId: string;
        }>;
  }) => PeerResult<ControlAcceptedInvitation>;
  listSecurityEvents: (input: {
    actor: ControlActorReference;
    businessId: string;
    cursor?: string;
    limit: number;
  }) => PeerResult<ControlSecurityEventList>;
}>;
