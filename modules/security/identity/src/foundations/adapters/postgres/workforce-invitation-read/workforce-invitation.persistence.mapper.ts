import type { WorkforceInvitationEntity } from '../../../language/workforce-invitation/workforce-invitation.entity.ts';

type StoredWorkforceInvitation = Readonly<{
  id: string;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: string;
  intendedLocationId: string | null;
  state: WorkforceInvitationEntity['state'];
  version: number;
  expiresAt: Date;
  createdAt: Date;
}>;

export const toWorkforceInvitationEntity = (
  invitation: StoredWorkforceInvitation,
): WorkforceInvitationEntity => ({
  id: invitation.id,
  businessId: invitation.businessId,
  emailNormalized: invitation.emailNormalized,
  displayName: invitation.displayName,
  intendedRole:
    invitation.intendedRole as WorkforceInvitationEntity['intendedRole'],
  intendedLocationId: invitation.intendedLocationId,
  state: invitation.state,
  version: invitation.version,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});
