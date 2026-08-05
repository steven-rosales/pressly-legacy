import type {
  ControlGrantEntity,
  ControlInvitationEntity,
  ControlMembershipEntity,
} from './control-workforce.entity.ts';
import type {
  ControlAcceptedInvitation,
  ControlGrant,
  ControlInvitation,
  ControlInvitationAcceptance,
  ControlInvitationPreview,
  ControlInvitationPreviewSnapshot,
  ControlIssueInvitation,
  ControlIssuedInvitation,
  ControlMember,
  ControlMemberDetail,
  ControlMembershipDetailSnapshot,
} from './control-workforce.model.ts';

export const toControlGrant = (value: ControlGrantEntity): ControlGrant => ({
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

export const toControlMember = (
  value: ControlMembershipEntity,
): ControlMember => ({
  membershipId: value.membershipId,
  businessId: value.businessId,
  identityId: value.identityId,
  displayName: value.displayName,
  email: value.email,
  state: value.state,
  version: value.version,
  mfaEnabled: value.mfaEnabled,
  grants: value.grants.map(toControlGrant),
  startedAt: value.startedAt.toISOString(),
  suspendedAt: value.suspendedAt?.toISOString() ?? null,
  endedAt: value.endedAt?.toISOString() ?? null,
});

export const toControlMemberDetail = (
  value: ControlMembershipDetailSnapshot,
): ControlMemberDetail => ({
  ...toControlMember(value),
  activeSessionCount: value.activeSessionCount,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});

export const toControlInvitation = (
  value: ControlInvitationEntity,
): ControlInvitation => ({
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

export const toControlInvitationPreview = (
  value: ControlInvitationPreviewSnapshot,
): ControlInvitationPreview => ({
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

export const toControlInvitationAcceptance = (
  value: ControlAcceptedInvitation,
): ControlInvitationAcceptance => ({
  invitationId: value.invitation.id,
  membershipId: value.membershipId,
  identityId: value.identityId,
  identityCreated: value.identityCreated,
  privilegedAccessEffective: value.privilegedAccessEffective,
  replayed: value.replayed,
  destination:
    value.invitation.intendedRole === 'operator' ? 'processor' : 'control',
});

export const toControlIssueInvitation = (
  value: ControlIssuedInvitation,
): ControlIssueInvitation =>
  value.status === 'issued'
    ? {
        status: value.status,
        invitation: toControlInvitation(value.invitation),
        acceptanceToken: value.token,
      }
    : {
        status: value.status,
        invitation: toControlInvitation(value.invitation),
      };
