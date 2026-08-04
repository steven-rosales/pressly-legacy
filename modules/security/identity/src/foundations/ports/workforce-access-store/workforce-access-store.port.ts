import type { AccessGrantSummary } from '../../language/access-grant/access-grant.model.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
  WorkforceRole,
  WorkforceScope,
} from '../../language/workforce/workforce.model.ts';

export type GrantAccessStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  identityId: string;
  role: WorkforceRole;
  scope: WorkforceScope;
  startsAt: Date | null;
  endsAt: Date | null;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type RevokeAccessStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  grantId: string;
  expectedVersion: number;
  reason: string | null;
  now: Date;
  idempotencyKey: string;
  commandHash: string;
}>;

export type RevokedAccess = Readonly<{
  grant: AccessGrantSummary;
  revokedSessionCount: number;
}>;

export type AccessGrantStore = Readonly<{
  grant: (
    input: GrantAccessStoreInput,
  ) => Promise<StoreMutationResult<AccessGrantSummary>>;
  revoke: (
    input: RevokeAccessStoreInput,
  ) => Promise<StoreMutationResult<RevokedAccess>>;
}>;
