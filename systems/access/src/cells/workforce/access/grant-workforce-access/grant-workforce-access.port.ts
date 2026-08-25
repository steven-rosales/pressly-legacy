import type { AccessGrantSummary } from '../../../../model/language/access-grant/access-grant.model.ts';
import type {
  StoreMutationResult,
  WorkforceActorRef,
  WorkforceRole,
  WorkforceScope,
} from '../../../../model/language/workforce/workforce.model.ts';

export type GrantWorkforceAccessStoreInput = Readonly<{
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

export type GrantWorkforceAccessStore = Readonly<{
  grant: (
    input: GrantWorkforceAccessStoreInput,
  ) => Promise<StoreMutationResult<AccessGrantSummary>>;
}>;
