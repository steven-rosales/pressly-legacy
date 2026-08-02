import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { WorkforceMembershipEvent } from './workforce-membership.policy.ts';
import type {
  StoreFailureReason,
  StoreMutationResult,
  WorkforceActorRef,
  WorkforceMemberDetail,
  WorkforcePage,
} from './workforce.model.ts';
import type { WorkforceCursor } from './workforce-pagination.policy.ts';

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
  list: (input: {
    actor: WorkforceActorRef;
    businessId: string;
    states?: readonly ('active' | 'suspended' | 'ended')[];
    query?: string;
    limit: number;
    cursor?: WorkforceCursor;
    now: Date;
  }) => Promise<
    Result<
      | Readonly<{ status: 'found'; page: WorkforcePage }>
      | Readonly<{
          status: 'rejected';
          reason: StoreFailureReason;
        }>,
      AppError
    >
  >;
  detail: (input: {
    actor: WorkforceActorRef;
    businessId: string;
    membershipId: string;
    now: Date;
  }) => Promise<
    Result<
      | Readonly<{ status: 'found'; member: WorkforceMemberDetail }>
      | Readonly<{
          status: 'rejected';
          reason: StoreFailureReason;
        }>,
      AppError
    >
  >;
  transition: (
    input: TransitionMembershipStoreInput,
  ) => Promise<Result<StoreMutationResult<TransitionedMembership>, AppError>>;
}>;
