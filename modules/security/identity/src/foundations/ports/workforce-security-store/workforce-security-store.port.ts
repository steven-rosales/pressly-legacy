import type { WorkforceCursor } from '../../language/workforce-pagination/workforce-cursor.value.ts';
import type {
  StoreFailureReason,
  StoreMutationResult,
  WorkforceActorRef,
} from '../../language/workforce/workforce.model.ts';

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

export type ListMemberSessionsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  now: Date;
}>;

export type ListMemberSessionsStoreResult =
  | Readonly<{
      status: 'found';
      sessions: readonly WorkforceSessionSummary[];
    }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type RevokeMemberSessionsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  sessionId?: string;
  idempotencyKey: string;
  commandHash: string;
  now: Date;
}>;

export type ListSecurityEventsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  limit: number;
  cursor?: WorkforceCursor;
  now: Date;
}>;

export type ListSecurityEventsStoreResult =
  | Readonly<{
      status: 'found';
      events: readonly WorkforceSecurityEventSummary[];
      nextCursor: string | null;
    }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type WorkforceSecurityStore = Readonly<{
  listMemberSessions: (
    input: ListMemberSessionsStoreInput,
  ) => Promise<ListMemberSessionsStoreResult>;
  revokeMemberSessions: (
    input: RevokeMemberSessionsStoreInput,
  ) => Promise<StoreMutationResult<Readonly<{ revokedCount: number }>>>;
  listSecurityEvents: (
    input: ListSecurityEventsStoreInput,
  ) => Promise<ListSecurityEventsStoreResult>;
}>;
