import type { JsonObject } from '@pressly/codec';

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
