import type { WorkforceInvitationEntity } from '../../../../model/language/workforce-invitation/workforce-invitation.entity.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
  WorkforceRole,
} from '../../../../model/language/workforce/workforce.model.ts';

export type IssueWorkforceInvitationStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  emailNormalized: string;
  displayName: string;
  intendedRole: WorkforceRole;
  intendedLocationId: string | null;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type IssueWorkforceInvitationStore = Readonly<{
  issue: (
    input: IssueWorkforceInvitationStoreInput,
  ) => Promise<StoreMutationResult<WorkforceInvitationEntity>>;
}>;
