import type { WorkforceInvitationEntity } from '../../../../model/language/workforce-invitation/workforce-invitation.entity.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
} from '../../../../model/language/workforce/workforce.model.ts';

export type ReissueWorkforceInvitationStoreInput = Readonly<{
  actor: WorkforceActorRef;
  invitationId: string;
  businessId: string;
  expectedVersion: number;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type ReissueWorkforceInvitationStore = Readonly<{
  reissue: (
    input: ReissueWorkforceInvitationStoreInput,
  ) => Promise<StoreMutationResult<WorkforceInvitationEntity>>;
}>;
