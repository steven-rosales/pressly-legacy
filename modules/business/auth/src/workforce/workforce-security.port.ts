import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type { WorkforceCursor } from './workforce-pagination.policy.ts';
import type {
  StoreFailureReason,
  StoreMutationResult,
  WorkforceActorRef,
} from './workforce.model.ts';

export type WorkforceSessionSummary = Readonly<{
  id: string;
  issuedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  current: boolean;
}>;

export type WorkforceSecurityEventSummary = Readonly<{
  id: string;
  eventType: string;
  resourceType: string;
  actorDisplayName: string | null;
  createdAt: Date;
}>;

export type WorkforceSecurityStore = Readonly<{
  listMemberSessions: (input: {
    actor: WorkforceActorRef;
    businessId: string;
    membershipId: string;
    now: Date;
  }) => Promise<
    Result<
      | Readonly<{
          status: 'found';
          sessions: readonly WorkforceSessionSummary[];
        }>
      | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>,
      AppError
    >
  >;
  revokeMemberSessions: (input: {
    actor: WorkforceActorRef;
    businessId: string;
    membershipId: string;
    sessionId?: string;
    idempotencyKey: string;
    commandHash: string;
    now: Date;
  }) => Promise<
    Result<StoreMutationResult<Readonly<{ revokedCount: number }>>, AppError>
  >;
  listSecurityEvents: (input: {
    actor: WorkforceActorRef;
    businessId: string;
    limit: number;
    cursor?: WorkforceCursor;
    now: Date;
  }) => Promise<
    Result<
      | Readonly<{
          status: 'found';
          events: readonly WorkforceSecurityEventSummary[];
          nextCursor: string | null;
        }>
      | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>,
      AppError
    >
  >;
}>;
