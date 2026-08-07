import type {
  StoreFailureReason,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';

export type WorkforceSessionSummary = Readonly<{
  id: string;
  issuedAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  current: boolean;
}>;

export type ListWorkforceMemberSessionsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  now: Date;
}>;

export type ListWorkforceMemberSessionsStoreResult =
  | Readonly<{
      status: 'found';
      sessions: readonly WorkforceSessionSummary[];
    }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type ListWorkforceMemberSessionsStore = Readonly<{
  listMemberSessions: (
    input: ListWorkforceMemberSessionsStoreInput,
  ) => Promise<ListWorkforceMemberSessionsStoreResult>;
}>;
