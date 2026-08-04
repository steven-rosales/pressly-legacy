import type { WorkforceInvitationSummary } from '../../../language/workforce-invitation/workforce-invitation.model.ts';
import type { JsonObject } from '@pressly/codec';

type StoredWorkforceInvitation = Readonly<{
  id: string;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: string;
  intendedLocationId: string | null;
  state: WorkforceInvitationSummary['state'];
  version: number;
  expiresAt: Date;
  createdAt: Date;
}>;

export const toWorkforceInvitationSummary = (
  invitation: StoredWorkforceInvitation,
): WorkforceInvitationSummary => ({
  id: invitation.id,
  businessId: invitation.businessId,
  emailNormalized: invitation.emailNormalized,
  displayName: invitation.displayName,
  intendedRole:
    invitation.intendedRole as WorkforceInvitationSummary['intendedRole'],
  intendedLocationId: invitation.intendedLocationId,
  state: invitation.state,
  version: invitation.version,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});

export type AcceptedInvitationReceipt = Readonly<{
  identityId: string;
  membershipId: string;
  identityCreated: boolean;
  privilegedAccessEffective: boolean;
}>;

export const readAcceptedInvitationReceipt = (
  metadata: JsonObject,
): AcceptedInvitationReceipt | null => {
  const identityId = metadata['identityId'];
  const membershipId = metadata['membershipId'];
  const identityCreated = metadata['identityCreated'];
  const privilegedAccessEffective = metadata['privilegedAccessEffective'];

  return typeof identityId === 'string' &&
    typeof membershipId === 'string' &&
    typeof identityCreated === 'boolean' &&
    typeof privilegedAccessEffective === 'boolean'
    ? {
        identityId,
        membershipId,
        identityCreated,
        privilegedAccessEffective,
      }
    : null;
};
