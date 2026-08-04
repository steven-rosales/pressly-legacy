import type { WorkforceMembershipEvent } from '../../language/workforce-membership/workforce-membership.lifecycle.ts';
import type { WorkforceCursor } from '../../language/workforce-pagination/workforce-cursor.value.ts';
import type {
  StoreFailureReason,
  StoreMutationResult,
  WorkforceActorRef,
} from '../../language/workforce/workforce.model.ts';
import type {
  WorkforceMemberDetail,
  WorkforcePage,
} from '../../language/workforce-membership/workforce-membership.model.ts';

export type ListWorkforceStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  states?: readonly ('active' | 'suspended' | 'ended')[];
  query?: string;
  limit: number;
  cursor?: WorkforceCursor;
  now: Date;
}>;

export type ListWorkforceStoreResult =
  | Readonly<{ status: 'found'; page: WorkforcePage }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type GetWorkforceMemberStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  now: Date;
}>;

export type GetWorkforceMemberStoreResult =
  | Readonly<{ status: 'found'; member: WorkforceMemberDetail }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type TransitionMembershipStoreInput = Readonly<{
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

export type WorkforceMembershipStore = Readonly<{
  list: (input: ListWorkforceStoreInput) => Promise<ListWorkforceStoreResult>;
  detail: (
    input: GetWorkforceMemberStoreInput,
  ) => Promise<GetWorkforceMemberStoreResult>;
  transition: (
    input: TransitionMembershipStoreInput,
  ) => Promise<StoreMutationResult<TransitionedMembership>>;
}>;
