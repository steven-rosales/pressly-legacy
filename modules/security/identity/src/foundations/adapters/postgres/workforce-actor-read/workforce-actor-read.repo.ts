import type { DatabaseTransaction } from '@pressly/db/client';
import { and, eq, gt, isNull, lte, or, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as business from '@pressly/db/schema/business';
import { strongestWorkforceRole } from '../../../language/workforce-authority/workforce-authority.policy.ts';
import type {
  StoreFailureReason,
  WorkforceActorRef,
} from '../../../language/workforce/workforce.model.ts';

type LoadedActor =
  | Readonly<{
      status: 'authorized';
      role: 'owner' | 'manager';
      locationIds: readonly string[];
    }>
  | Readonly<{ status: 'rejected'; reason: StoreFailureReason }>;

export const loadAuthorizedActor = async (
  tx: DatabaseTransaction,
  input: {
    actor: WorkforceActorRef;
    businessId: string;
    now: Date;
    requireMfa: boolean;
  },
): Promise<LoadedActor> => {
  const [session] = await tx
    .select({
      assuranceLevel: auth.authSessions.assuranceLevel,
      identityActive: auth.authIdentities.isActive,
    })
    .from(auth.authSessions)
    .innerJoin(
      auth.authIdentities,
      eq(auth.authIdentities.id, auth.authSessions.identityId),
    )
    .where(
      and(
        eq(auth.authSessions.id, input.actor.sessionId),
        eq(auth.authSessions.identityId, input.actor.identityId),
        isNull(auth.authSessions.revokedAt),
        gt(auth.authSessions.expiresAt, input.now),
      ),
    )
    .limit(1);

  if (session === undefined || !session.identityActive)
    return { status: 'rejected', reason: 'actor_inactive' };

  const [membership] = await tx
    .select({
      state: auth.workforceMemberships.state,
    })
    .from(auth.workforceMemberships)
    .where(
      and(
        eq(auth.workforceMemberships.businessId, input.businessId),
        eq(auth.workforceMemberships.identityId, input.actor.identityId),
      ),
    )
    .orderBy(sql`${auth.workforceMemberships.createdAt} desc`)
    .limit(1);

  if (membership?.state !== 'active')
    return { status: 'rejected', reason: 'actor_membership_inactive' };

  const [mfa] = await tx
    .select({ status: auth.authMfaCredentials.status })
    .from(auth.authMfaCredentials)
    .where(eq(auth.authMfaCredentials.identityId, input.actor.identityId))
    .limit(1);

  if (
    input.requireMfa &&
    (session.assuranceLevel !== 'mfa' || mfa?.status !== 'enabled')
  )
    return { status: 'rejected', reason: 'insufficient_assurance' };

  const grants = await tx
    .select()
    .from(auth.authAccessGrants)
    .where(
      and(
        eq(auth.authAccessGrants.businessId, input.businessId),
        eq(auth.authAccessGrants.identityId, input.actor.identityId),
        eq(auth.authAccessGrants.state, 'active'),
        or(
          isNull(auth.authAccessGrants.startsAt),
          lte(auth.authAccessGrants.startsAt, input.now),
        ),
        or(
          isNull(auth.authAccessGrants.endsAt),
          gt(auth.authAccessGrants.endsAt, input.now),
        ),
      ),
    );
  const role = strongestWorkforceRole(grants);
  if (role !== 'owner' && role !== 'manager')
    return { status: 'rejected', reason: 'manager_target_forbidden' };

  if ((role === 'owner' || role === 'manager') && mfa?.status !== 'enabled')
    return { status: 'rejected', reason: 'insufficient_assurance' };

  let locationIds = grants
    .filter(
      (grant) =>
        grant.role === role &&
        grant.scopeKind === 'location' &&
        grant.locationId !== null,
    )
    .map((grant) => grant.locationId!);

  if (
    role === 'manager' &&
    grants.some(
      (grant) => grant.role === 'manager' && grant.scopeKind === 'business',
    )
  ) {
    const locations = await tx
      .select({ id: business.productionLocations.id })
      .from(business.productionLocations)
      .where(
        and(
          eq(business.productionLocations.businessId, input.businessId),
          eq(business.productionLocations.isActive, true),
        ),
      );
    locationIds = locations.map((location) => location.id);
  }

  return {
    status: 'authorized',
    role,
    locationIds: [...new Set(locationIds)],
  };
};
