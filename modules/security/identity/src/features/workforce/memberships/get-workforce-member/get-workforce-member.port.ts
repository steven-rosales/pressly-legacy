import type {
  StoreFailureReason,
  WorkforceActorRef,
} from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforceMemberDetail } from '../../../../foundations/language/workforce-membership/workforce-membership.model.ts';

export type GetWorkforceMemberStoreInput = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
  now: Date;
}>;

export type GetWorkforceMemberStoreResult =
  | Readonly<{ status: 'found'; member: WorkforceMemberDetail }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export type GetWorkforceMemberStore = Readonly<{
  detail: (
    input: GetWorkforceMemberStoreInput,
  ) => Promise<GetWorkforceMemberStoreResult>;
}>;
