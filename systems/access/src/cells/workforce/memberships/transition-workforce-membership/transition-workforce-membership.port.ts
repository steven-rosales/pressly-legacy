import type { WorkforceMembershipEvent } from '../../../../model/language/workforce-membership/workforce-membership.lifecycle.ts';
import type { WorkforceMemberDetail } from '../../../../model/language/workforce-membership/workforce-membership.model.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
} from '../../../../model/language/workforce/workforce.model.ts';

export type TransitionWorkforceMembershipStoreInput = Readonly<{
  actor: WorkforceActorRef;
  membershipId: string;
  businessId: string;
  expectedVersion: number;
  event: WorkforceMembershipEvent;
  reason: string | null;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type TransitionedMembership = Readonly<{
  member: WorkforceMemberDetail;
  revokedSessionCount: number;
}>;

export type TransitionWorkforceMembershipStore = Readonly<{
  transition: (
    input: TransitionWorkforceMembershipStoreInput,
  ) => Promise<StoreMutationResult<TransitionedMembership>>;
}>;
