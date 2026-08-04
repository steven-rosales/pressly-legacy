import { result, type Result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import {
  workforceStoreFailure,
  type WorkforceFailure,
} from '../../../../foundations/language/workforce-failure/workforce-failure.failure.ts';
import { requireIdentifier } from '../../../../foundations/language/workforce-command/workforce-command.policy.ts';
import type { WorkforceActorRef } from '../../../../foundations/language/workforce/workforce.model.ts';
import type { WorkforceMemberDetail } from '../../../../foundations/language/workforce-membership/workforce-membership.model.ts';
import type { WorkforceMembershipStore } from '../../../../foundations/ports/workforce-membership-store/workforce-membership-store.port.ts';

export type GetWorkforceMemberCommand = Readonly<{
  actor: WorkforceActorRef;
  businessId: string;
  membershipId: string;
}>;

export type GetWorkforceMember = (
  command: GetWorkforceMemberCommand,
) => Promise<Result<WorkforceMemberDetail, WorkforceFailure>>;

export const makeGetWorkforceMember =
  (deps: {
    store: WorkforceMembershipStore;
    clock: Clock;
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
    if (found.status === 'rejected')
      return result.err(workforceStoreFailure(found.reason));

    return result.ok(found.member);
  };
