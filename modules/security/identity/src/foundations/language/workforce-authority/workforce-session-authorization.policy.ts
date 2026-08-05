import {
  decideWorkforceSessionAdministration,
  strongestWorkforceRole,
} from './workforce-authority.policy.ts';
import type { WorkforceMemberDetail } from '../workforce-membership/workforce-membership.model.ts';

const effectiveTargetRole = (member: WorkforceMemberDetail) =>
  strongestWorkforceRole(
    member.grants
      .filter((grant) => grant.effective)
      .map((grant) => ({ role: grant.role })),
  );

const effectiveTargetLocations = (
  member: WorkforceMemberDetail,
): readonly string[] =>
  member.grants
    .filter(
      (grant) =>
        grant.effective &&
        grant.role === 'operator' &&
        grant.scope.kind === 'location',
    )
    .map((grant) => grant.scope.id);

export const workforceSessionTargetDenial = (
  actor: Readonly<{
    role: 'owner' | 'manager';
    locationIds: readonly string[];
  }>,
  member: WorkforceMemberDetail,
) => {
  const decision = decideWorkforceSessionAdministration({
    actor: {
      identityActive: true,
      membershipState: 'active',
      businessId: member.businessId,
      role: actor.role,
      locationIds: actor.locationIds,
      assuranceLevel: 'mfa',
    },
    targetBusinessId: member.businessId,
    targetRole: effectiveTargetRole(member),
    targetLocationIds: effectiveTargetLocations(member),
  });

  return decision.kind === 'denied' ? decision.reason : null;
};
