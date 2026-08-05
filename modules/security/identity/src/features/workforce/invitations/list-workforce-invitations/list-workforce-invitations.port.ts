import type { WorkforceInvitationEntity } from '../../../../foundations/language/workforce-invitation/workforce-invitation.entity.ts';
import type { WorkforceCursor } from '../../../../foundations/language/workforce-pagination/workforce-cursor.value.ts';
import type {
  StoreFailureReason,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';

export type ListWorkforceInvitationsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  includeTerminal: boolean;
  limit: number;
  cursor?: WorkforceCursor;
  now: Date;
}>;

export type ListWorkforceInvitationsStoreResult =
  | Readonly<{
      status: 'found';
      invitations: readonly WorkforceInvitationEntity[];
      nextCursor: string | null;
    }>
  | Readonly<{
      status: 'rejected';
      reason: StoreFailureReason;
    }>;

export type ListWorkforceInvitationsStore = Readonly<{
  list: (
    input: ListWorkforceInvitationsStoreInput,
  ) => Promise<ListWorkforceInvitationsStoreResult>;
}>;
