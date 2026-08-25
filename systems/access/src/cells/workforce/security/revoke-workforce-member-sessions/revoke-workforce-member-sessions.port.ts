import type {
  StoreMutationResult,
  WorkforceActorRef,
} from '../../../../model/language/workforce/workforce.model.ts';

export type RevokeWorkforceMemberSessionsStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  sessionId?: string;
  idempotencyKey: string;
  commandHash: string;
  now: Date;
}>;

export type RevokeWorkforceMemberSessionsStore = Readonly<{
  revokeMemberSessions: (
    input: RevokeWorkforceMemberSessionsStoreInput,
  ) => Promise<StoreMutationResult<Readonly<{ revokedCount: number }>>>;
}>;
