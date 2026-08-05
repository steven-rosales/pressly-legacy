import type { WorkforceInvitationEntity } from '../../../../foundations/language/workforce-invitation/workforce-invitation.entity.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';

export type RevokeWorkforceInvitationStoreInput = Readonly<{
  actor: WorkforceActorRef;
  invitationId: string;
  businessId: string;
  expectedVersion: number;
  reason: string | null;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type RevokeWorkforceInvitationStore = Readonly<{
  revoke: (
    input: RevokeWorkforceInvitationStoreInput,
  ) => Promise<StoreMutationResult<WorkforceInvitationEntity>>;
}>;
