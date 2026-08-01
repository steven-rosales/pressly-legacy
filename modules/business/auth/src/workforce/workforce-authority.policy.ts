import type {
  StoreFailureReason,
  WorkforceActorRef,
  WorkforceRole,
} from './workforce.port.ts';

export type WorkforceAuthority = Readonly<{
  identityActive: boolean;
  membershipState: 'active' | 'suspended' | 'ended';
  businessId: string;
  role: WorkforceRole;
  locationIds: readonly string[];
  assuranceLevel: 'password' | 'mfa' | 'service_key';
}>;

export type WorkforceAuthorityDecision =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{
      kind: 'denied';
      reason:
        | 'actor_inactive'
        | 'actor_membership_inactive'
        | 'insufficient_assurance'
        | 'outside_business'
        | 'outside_location'
        | 'manager_target_forbidden'
        | 'self_access_change';
    }>;

export const decideWorkforceAdministration = (input: {
  actor: WorkforceAuthority;
  targetBusinessId: string;
  targetIdentityId?: string;
  actorIdentityId: string;
  targetRole: WorkforceRole;
  targetLocationId: string | null;
}): WorkforceAuthorityDecision => {
  if (!input.actor.identityActive)
    return { kind: 'denied', reason: 'actor_inactive' };

  if (input.actor.membershipState !== 'active')
    return { kind: 'denied', reason: 'actor_membership_inactive' };

  if (input.actor.assuranceLevel !== 'mfa')
    return { kind: 'denied', reason: 'insufficient_assurance' };

  if (input.actor.businessId !== input.targetBusinessId)
    return { kind: 'denied', reason: 'outside_business' };

  if (
    input.targetIdentityId !== undefined &&
    input.targetIdentityId === input.actorIdentityId
  )
    return { kind: 'denied', reason: 'self_access_change' };

  if (input.actor.role === 'operator')
    return { kind: 'denied', reason: 'manager_target_forbidden' };

  if (input.actor.role === 'manager') {
    if (input.targetRole !== 'operator')
      return { kind: 'denied', reason: 'manager_target_forbidden' };

    if (
      input.targetLocationId === null ||
      !input.actor.locationIds.includes(input.targetLocationId)
    )
      return { kind: 'denied', reason: 'outside_location' };
  }

  return { kind: 'allowed' };
};

export const decideWorkforceSessionAdministration = (input: {
  actor: WorkforceAuthority;
  targetBusinessId: string;
  targetRole: WorkforceRole | null;
  targetLocationIds: readonly string[];
}): WorkforceAuthorityDecision => {
  if (!input.actor.identityActive)
    return { kind: 'denied', reason: 'actor_inactive' };
  if (input.actor.membershipState !== 'active')
    return { kind: 'denied', reason: 'actor_membership_inactive' };
  if (input.actor.assuranceLevel !== 'mfa')
    return { kind: 'denied', reason: 'insufficient_assurance' };
  if (input.actor.businessId !== input.targetBusinessId)
    return { kind: 'denied', reason: 'outside_business' };
  if (input.actor.role === 'owner') return { kind: 'allowed' };
  if (input.actor.role !== 'manager' || input.targetRole !== 'operator')
    return { kind: 'denied', reason: 'manager_target_forbidden' };
  if (
    input.targetLocationIds.length === 0 ||
    !input.targetLocationIds.every((locationId) =>
      input.actor.locationIds.includes(locationId),
    )
  )
    return { kind: 'denied', reason: 'outside_location' };
  return { kind: 'allowed' };
};

export const isWorkforceGrantEffective = (input: {
  state: 'active' | 'revoked' | 'expired';
  role: WorkforceRole;
  membershipState: 'active' | 'suspended' | 'ended';
  mfaEnabled: boolean;
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
}): boolean => {
  if (input.state !== 'active' || input.membershipState !== 'active')
    return false;
  if (input.startsAt !== null && input.startsAt > input.now) return false;
  if (input.endsAt !== null && input.endsAt <= input.now) return false;
  if ((input.role === 'owner' || input.role === 'manager') && !input.mfaEnabled)
    return false;

  return true;
};

export type AuthorizedWorkforceActor = Readonly<{
  role: 'owner' | 'manager';
  locationIds: readonly string[];
}>;

export const authorizeWorkforceTarget = (input: {
  actor: AuthorizedWorkforceActor;
  actorRef: WorkforceActorRef;
  businessId: string;
  targetIdentityId?: string;
  targetRole: WorkforceRole;
  targetLocationId: string | null;
}): StoreFailureReason | null => {
  const decision = decideWorkforceAdministration({
    actor: {
      identityActive: true,
      membershipState: 'active',
      businessId: input.businessId,
      role: input.actor.role,
      locationIds: input.actor.locationIds,
      assuranceLevel: 'mfa',
    },
    targetBusinessId: input.businessId,
    ...(input.targetIdentityId === undefined
      ? {}
      : { targetIdentityId: input.targetIdentityId }),
    actorIdentityId: input.actorRef.identityId,
    targetRole: input.targetRole,
    targetLocationId: input.targetLocationId,
  });

  return decision.kind === 'allowed' ? null : decision.reason;
};

const rolePriority: Readonly<Record<WorkforceRole, number>> = {
  owner: 3,
  manager: 2,
  operator: 1,
};

export const strongestWorkforceRole = (
  grants: readonly Readonly<{ role: string }>[],
): WorkforceRole | null => {
  const roles = grants
    .map((grant) => grant.role)
    .filter(
      (role): role is WorkforceRole =>
        role === 'owner' || role === 'manager' || role === 'operator',
    )
    .sort((left, right) => rolePriority[right] - rolePriority[left]);

  return roles[0] ?? null;
};
