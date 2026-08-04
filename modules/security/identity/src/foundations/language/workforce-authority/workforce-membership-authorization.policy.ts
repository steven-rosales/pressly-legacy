import { strongestWorkforceRole } from './workforce-authority.policy.ts';
import type { WorkforceRole } from '../workforce/workforce.model.ts';
import type { WorkforceMemberDetail } from '../workforce-membership/workforce-membership.model.ts';

export const targetLocationForActor = (
  member: WorkforceMemberDetail,
  actorLocationIds: readonly string[],
): string | null =>
  member.grants.find(
    (grant) =>
      grant.effective &&
      grant.role === 'operator' &&
      grant.scope.kind === 'location' &&
      actorLocationIds.includes(grant.scope.id),
  )?.scope.id ?? null;

export const targetRole = (
  member: WorkforceMemberDetail,
): WorkforceRole | null =>
  strongestWorkforceRole(
    member.grants
      .filter((grant) => grant.effective)
      .map((grant) => ({ role: grant.role })),
  );
