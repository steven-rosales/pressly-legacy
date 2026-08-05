import type { WorkforceInvitationEntity } from '../../../../foundations/language/workforce-invitation/workforce-invitation.entity.ts';
import type { StoreMutationResult } from '../../../../foundations/language/workforce/workforce.model.ts';

export type AcceptWorkforceInvitationStoreInput = Readonly<{
  tokenHash: string;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
  acceptance:
    | Readonly<{
        kind: 'new_identity';
        passwordHash: string;
      }>
    | Readonly<{
        kind: 'existing_identity';
        authenticatedIdentityId: string;
        authenticatedSessionId: string;
      }>;
}>;

export type AcceptedInvitation = Readonly<{
  invitation: WorkforceInvitationEntity;
  identityId: string;
  membershipId: string;
  identityCreated: boolean;
  privilegedAccessEffective: boolean;
}>;

export type AcceptWorkforceInvitationStore = Readonly<{
  accept: (
    input: AcceptWorkforceInvitationStoreInput,
  ) => Promise<StoreMutationResult<AcceptedInvitation>>;
}>;
