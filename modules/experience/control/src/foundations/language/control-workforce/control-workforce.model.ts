import type {
  ControlGrantEntity,
  ControlInvitationEntity,
  ControlMembershipEntity,
} from './control-workforce.entity.ts';
import type {
  ControlInvitationState,
  ControlMembershipState,
  ControlWorkforceRole,
} from './control-workforce.value.ts';

export type ControlGrant = Omit<ControlGrantEntity, 'startsAt' | 'endsAt'> &
  Readonly<{
    startsAt: string | null;
    endsAt: string | null;
  }>;

export type ControlInvitation = Readonly<{
  id: string;
  businessId: string;
  email: string;
  displayName: string;
  intendedRole: ControlWorkforceRole;
  intendedLocationId: string | null;
  state: ControlInvitationState;
  version: number;
  expiresAt: string;
  createdAt: string;
}>;

export type ControlInvitationPreviewSnapshot = Readonly<{
  invitationId: string;
  businessId: string;
  businessName: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: ControlWorkforceRole;
  intendedLocationId: string | null;
  expiresAt: Date;
  existingIdentity: boolean;
}>;

export type ControlInvitationPreview = Readonly<{
  invitationId: string;
  business: Readonly<{ id: string; name: string }>;
  email: string;
  displayName: string;
  intendedRole: ControlWorkforceRole;
  intendedLocationId: string | null;
  expiresAt: string;
  existingIdentity: boolean;
}>;

export type ControlMember = Readonly<{
  membershipId: string;
  businessId: string;
  identityId: string;
  displayName: string;
  email: string;
  state: ControlMembershipState;
  version: number;
  mfaEnabled: boolean;
  grants: readonly ControlGrant[];
  startedAt: string;
  suspendedAt: string | null;
  endedAt: string | null;
}>;

export type ControlMembershipDetailSnapshot = ControlMembershipEntity &
  Readonly<{
    activeSessionCount: number;
    createdAt: Date;
    updatedAt: Date;
  }>;

export type ControlMemberDetail = ControlMember &
  Readonly<{
    activeSessionCount: number;
    createdAt: string;
    updatedAt: string;
  }>;

export type ControlMemberPage = Readonly<{
  members: readonly ControlMember[];
  nextCursor: string | null;
}>;

export type ControlInvitationPage = Readonly<{
  invitations: readonly ControlInvitation[];
  nextCursor: string | null;
}>;

export type ControlAcceptedInvitation = Readonly<{
  invitation: ControlInvitationEntity;
  membershipId: string;
  identityId: string;
  identityCreated: boolean;
  privilegedAccessEffective: boolean;
  replayed: boolean;
}>;

export type ControlInvitationAcceptance = Readonly<{
  invitationId: string;
  membershipId: string;
  identityId: string;
  identityCreated: boolean;
  privilegedAccessEffective: boolean;
  replayed: boolean;
  destination: 'control' | 'processor';
}>;

export type ControlIssuedInvitation =
  | Readonly<{
      status: 'issued';
      invitation: ControlInvitationEntity;
      token: string;
    }>
  | Readonly<{
      status: 'replayed';
      invitation: ControlInvitationEntity;
    }>;

export type ControlIssueInvitation =
  | Readonly<{
      status: 'issued';
      invitation: ControlInvitation;
      acceptanceToken: string;
    }>
  | Readonly<{
      status: 'replayed';
      invitation: ControlInvitation;
    }>;

export type ControlMembershipTransition = Readonly<{
  member: ControlMembershipDetailSnapshot;
  revokedSessionCount: number;
}>;

export type ControlGrantRevocation = Readonly<{
  grant: ControlGrantEntity;
  revokedSessionCount: number;
}>;

export type ControlWorkforceSessionList = Readonly<{
  sessions: readonly Readonly<{
    id: string;
    issuedAt: string;
    lastUsedAt: string;
    expiresAt: string;
    revokedAt: string | null;
    current: boolean;
  }>[];
}>;

export type ControlSessionRevocation = Readonly<{
  revokedCount: number;
  replayed: boolean;
}>;

export type ControlSecurityEventList = Readonly<{
  events: readonly Readonly<{
    id: string;
    eventType: string;
    resourceType: string;
    actorDisplayName: string | null;
    createdAt: string;
  }>[];
  nextCursor: string | null;
}>;
