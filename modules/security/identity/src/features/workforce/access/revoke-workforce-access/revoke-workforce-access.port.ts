import type { AccessGrantSummary } from '../../../../foundations/language/access-grant/access-grant.model.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';

export type RevokeWorkforceAccessStoreInput = Readonly<{
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

export type RevokeWorkforceAccessStore = Readonly<{
  revoke: (
    input: RevokeWorkforceAccessStoreInput,
  ) => Promise<StoreMutationResult<RevokedAccess>>;
}>;
