import type {
  ControlGrantEntity,
  ControlMembershipEntity,
} from '../../../foundations/language/control-workforce/control-workforce.entity.ts';
import type {
  ControlGrant,
  ControlMember,
  ControlMemberDetail,
  ControlMembershipDetailSnapshot,
} from '../../../foundations/language/control-workforce/control-workforce.model.ts';

export const toControlGrant = (value: ControlGrantEntity): ControlGrant => ({
  id: value.id,
  businessId: value.businessId,
  membershipId: value.membershipId,
  identityId: value.identityId,
  role: value.role,
  scope: value.scope,
  state: value.state,
  version: value.version,
  startsAt: value.startsAt?.toISOString() ?? null,
  endsAt: value.endsAt?.toISOString() ?? null,
  effective: value.effective,
});

export const toControlMember = (
  value: ControlMembershipEntity,
): ControlMember => ({
  membershipId: value.membershipId,
  businessId: value.businessId,
  identityId: value.identityId,
  displayName: value.displayName,
  email: value.email,
  state: value.state,
  version: value.version,
  mfaEnabled: value.mfaEnabled,
  grants: value.grants.map(toControlGrant),
  startedAt: value.startedAt.toISOString(),
  suspendedAt: value.suspendedAt?.toISOString() ?? null,
  endedAt: value.endedAt?.toISOString() ?? null,
});

export const toControlMemberDetail = (
  value: ControlMembershipDetailSnapshot,
): ControlMemberDetail => ({
  ...toControlMember(value),
  activeSessionCount: value.activeSessionCount,
  createdAt: value.createdAt.toISOString(),
  updatedAt: value.updatedAt.toISOString(),
});
