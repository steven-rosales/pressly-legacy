import type {
  AccessGrantSummary,
  WorkforceInvitationPreview,
  WorkforceInvitationSummary,
  WorkforceMemberDetail,
  WorkforceMemberSummary,
} from '@pressly/auth-module';

const grant = (value: AccessGrantSummary) => ({
  id: value.id,
  businessId: value.businessId,
  membershipId: value.membershipId,
  identityId: value.identityId,
  role: value.role,
  scope: value.scope,
  state: value.state,
  version: value.version,
  startsAt: value.startsAt?.toISOString() ?? null,
  endsAt: value.endsAt?.toISOString() ?? null,
  effective: value.effective,
});

export const controlInvitation = (value: WorkforceInvitationSummary) => ({
  id: value.id,
  businessId: value.businessId,
  email: value.emailNormalized,
  displayName: value.displayName,
  intendedRole: value.intendedRole,
  intendedLocationId: value.intendedLocationId,
  state: value.state,
  version: value.version,
  expiresAt: value.expiresAt.toISOString(),
  createdAt: value.createdAt.toISOString(),
});

export const controlInvitationPreview = (
  value: WorkforceInvitationPreview,
) => ({
  invitationId: value.invitationId,
  business: {
    id: value.businessId,
    name: value.businessName,
  },
  email: value.emailNormalized,
  displayName: value.displayName,
  intendedRole: value.intendedRole,
  intendedLocationId: value.intendedLocationId,
  expiresAt: value.expiresAt.toISOString(),
  existingIdentity: value.existingIdentity,
});

export const controlMember = (value: WorkforceMemberSummary) => ({
  membershipId: value.membershipId,
  businessId: value.businessId,
  identityId: value.identityId,
  displayName: value.displayName,
  email: value.email,
  state: value.state,
  version: value.version,
  mfaEnabled: value.mfaEnabled,
  grants: value.grants.map(grant),
  startedAt: value.startedAt.toISOString(),
  suspendedAt: value.suspendedAt?.toISOString() ?? null,
  endedAt: value.endedAt?.toISOString() ?? null,
});

export const controlMemberDetail = (value: WorkforceMemberDetail) => ({
  ...controlMember(value),
  activeSessionCount: value.activeSessionCount,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export const controlGrant = grant;
