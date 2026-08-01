import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';
import type {
  AccessGrantSummary,
  StoreMutationResult,
  WorkforceActorRef,
  WorkforceRole,
  WorkforceScope,
} from '../workforce.port.ts';

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
  ) => Promise<Result<StoreMutationResult<AccessGrantSummary>, AppError>>;
  revoke: (
    input: RevokeAccessStoreInput,
  ) => Promise<Result<StoreMutationResult<RevokedAccess>, AppError>>;
}>;
