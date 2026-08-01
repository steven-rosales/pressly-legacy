import type { AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';
import { workforceStoreFailure } from './workforce.error.ts';
import { requireIdentifier } from './workforce-validation.policy.ts';
import type {
  WorkforceActorRef,
  WorkforceMemberDetail,
} from './workforce.port.ts';
import type { WorkforceClock } from './workforce-invitation.port.ts';
import type { WorkforceMembershipStore } from './workforce-membership.port.ts';

export type GetWorkforceMemberCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
}>;

export type GetWorkforceMember = (
  command: GetWorkforceMemberCommand,
) => Promise<Result<WorkforceMemberDetail, AppError>>;

export const makeGetWorkforceMember =
  (deps: {
    store: WorkforceMembershipStore;
    clock: WorkforceClock;
  }): GetWorkforceMember =>
  async (command) => {
    const businessId = requireIdentifier(command.businessId, 'business_id');
    if (result.isErr(businessId)) return businessId;
    const membershipId = requireIdentifier(
      command.membershipId,
      'membership_id',
    );
    if (result.isErr(membershipId)) return membershipId;
    const found = await deps.store.detail({
      actor: command.actor,
      businessId: businessId.value,
      membershipId: membershipId.value,
      now: deps.clock.now(),
    });
    if (result.isErr(found)) return found;
    if (found.value.status === 'rejected')
      return result.err(workforceStoreFailure(found.value.reason));

    return result.ok(found.value.member);
  };
