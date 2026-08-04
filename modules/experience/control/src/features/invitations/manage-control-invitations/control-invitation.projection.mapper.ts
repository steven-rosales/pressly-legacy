import type { ControlInvitationEntity } from '../../../foundations/language/control-workforce/control-workforce.entity.ts';
import type {
  ControlAcceptedInvitation,
  ControlInvitation,
  ControlInvitationAcceptance,
  ControlInvitationPreview,
  ControlInvitationPreviewSnapshot,
  ControlIssueInvitation,
  ControlIssuedInvitation,
} from '../../../foundations/language/control-workforce/control-workforce.model.ts';

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
