import {
  and,
  auth,
  business,
  count,
  eq,
  gt,
  isNull,
  lte,
  or,
  sql,
  type DatabaseTransaction,
} from '@pressly/db';
import {
  isWorkforceGrantEffective,
  strongestWorkforceRole,
} from './workforce-authority.policy.ts';
import type {
  AccessGrantSummary,
  StoreFailureReason,
  WorkforceActorRef,
  WorkforceInvitationSummary,
  WorkforceMemberDetail,
  WorkforceRole,
} from './workforce.port.ts';

export type ReceiptCheck =
  | Readonly<{ status: 'new' }>
  | Readonly<{ status: 'conflict' }>
  | Readonly<{
      status: 'replayed';
      aggregateId: string;
      resultMetadata: unknown;
    }>;

export const lockBusiness = async (
  tx: DatabaseTransaction,
  businessId: string,
): Promise<void> => {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`pressly.auth.workforce.${businessId}`}))`,
  );
};

export const checkReceipt = async (
  tx: DatabaseTransaction,
  idempotencyKey: string,
  commandHash: string,
): Promise<ReceiptCheck> => {
  const [receipt] = await tx
    .select({
      commandHash: auth.authCommandReceipts.commandHash,
      aggregateId: auth.authCommandReceipts.aggregateId,
      resultMetadata: auth.authCommandReceipts.resultMetadata,
    })
    .from(auth.authCommandReceipts)
    .where(eq(auth.authCommandReceipts.idempotencyKey, idempotencyKey))
    .limit(1);

  if (receipt === undefined) return { status: 'new' };
  if (receipt.commandHash !== commandHash) return { status: 'conflict' };
  return {
    status: 'replayed',
    aggregateId: receipt.aggregateId,
    resultMetadata: receipt.resultMetadata,
  };
};

export const recordReceipt = async (
  tx: DatabaseTransaction,
  input: {
    idempotencyKey: string;
    businessId: string;
    aggregateKind: string;
    aggregateId: string;
    commandHash: string;
    actorIdentityId: string;
    resultMetadata: Readonly<Record<string, unknown>>;
    now: Date;
  },
): Promise<void> => {
  await tx.insert(auth.authCommandReceipts).values({
    idempotencyKey: input.idempotencyKey,
    businessId: input.businessId,
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    commandHash: input.commandHash,
    actorKind: 'human',
    actorId: input.actorIdentityId,
    actorIdentityId: input.actorIdentityId,
    resultMetadata: input.resultMetadata,
    createdAt: input.now,
  });
};

export const recordAudit = async (
  tx: DatabaseTransaction,
  input: {
    businessId: string;
    actorIdentityId: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    metadata?: Readonly<Record<string, unknown>>;
    now: Date;
  },
): Promise<void> => {
  await tx.insert(auth.authAuditEvents).values({
    businessId: input.businessId,
    principalIdentityId: input.actorIdentityId,
    eventType: input.eventType,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadata: input.metadata ?? {},
    createdAt: input.now,
  });
};

export const recordTransition = async (
  tx: DatabaseTransaction,
  input: {
    businessId: string;
    aggregateKind: 'invitation' | 'membership' | 'access_grant';
    aggregateId: string;
    fromState: string;
    toState: string;
    eventType: string;
    aggregateVersion: number;
    idempotencyKey: string;
    commandHash: string;
    actorKind?: 'human' | 'system';
    actorIdentityId?: string;
    reasonCode: string;
    reasonNote?: string | null;
    now: Date;
  },
): Promise<void> => {
  const actorKind = input.actorKind ?? 'human';
  const actorIdentityId = input.actorIdentityId;
  await tx.insert(auth.authLifecycleTransitions).values({
    businessId: input.businessId,
    aggregateKind: input.aggregateKind,
    aggregateId: input.aggregateId,
    fromState: input.fromState,
    toState: input.toState,
    eventType: input.eventType,
    aggregateVersion: input.aggregateVersion,
    idempotencyKey: input.idempotencyKey,
    commandHash: input.commandHash,
    origin: 'pressly_control',
    actorKind,
    actorId:
      actorKind === 'system' ? 'pressly.auth.lifecycle' : actorIdentityId!,
    ...(actorIdentityId === undefined ? {} : { actorIdentityId }),
    reasonCode: input.reasonCode,
    ...(input.reasonNote ? { reasonNote: input.reasonNote } : {}),
    occurredAt: input.now,
  });
};

type StoredInvitation = typeof auth.workforceInvitations.$inferSelect;
type StoredGrant = typeof auth.authAccessGrants.$inferSelect;

export const invitationSummary = (
  invitation: StoredInvitation,
): WorkforceInvitationSummary => ({
  id: invitation.id,
  businessId: invitation.businessId,
  emailNormalized: invitation.emailNormalized,
  displayName: invitation.displayName,
  intendedRole: invitation.intendedRole as WorkforceRole,
  intendedLocationId: invitation.intendedLocationId,
  state: invitation.state,
  version: invitation.version,
  expiresAt: invitation.expiresAt,
  createdAt: invitation.createdAt,
});

export const grantSummary = (
  grant: StoredGrant,
  effective: boolean,
): AccessGrantSummary => ({
  id: grant.id,
  businessId: grant.businessId,
  membershipId: grant.membershipId,
  identityId: grant.identityId,
  role: grant.role as WorkforceRole,
  scope:
    grant.scopeKind === 'location'
      ? { kind: 'location', id: grant.scopeId }
      : { kind: 'business', id: grant.scopeId },
  state: grant.state,
  version: grant.version,
  startsAt: grant.startsAt,
  endsAt: grant.endsAt,
  effective,
});

export type LoadedActor =
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

export const locationBelongsToBusiness = async (
  tx: DatabaseTransaction,
  businessId: string,
  locationId: string | null,
): Promise<boolean> => {
  if (locationId === null) return true;
  const [location] = await tx
    .select({ id: business.productionLocations.id })
    .from(business.productionLocations)
    .where(
      and(
        eq(business.productionLocations.businessId, businessId),
        eq(business.productionLocations.id, locationId),
      ),
    )
    .limit(1);
  return location !== undefined;
};

export const loadMemberDetail = async (
  tx: DatabaseTransaction,
  input: {
    businessId: string;
    membershipId: string;
    now: Date;
  },
): Promise<WorkforceMemberDetail | null> => {
  const [record] = await tx
    .select({
      membership: auth.workforceMemberships,
      identity: auth.authIdentities,
    })
    .from(auth.workforceMemberships)
    .innerJoin(
      auth.authIdentities,
      eq(auth.authIdentities.id, auth.workforceMemberships.identityId),
    )
    .where(
      and(
        eq(auth.workforceMemberships.id, input.membershipId),
        eq(auth.workforceMemberships.businessId, input.businessId),
      ),
    )
    .limit(1);
  if (record === undefined) return null;

  const grants = await tx
    .select()
    .from(auth.authAccessGrants)
    .where(
      and(
        eq(auth.authAccessGrants.membershipId, record.membership.id),
        eq(auth.authAccessGrants.businessId, input.businessId),
      ),
    );
  const [mfa] = await tx
    .select({ status: auth.authMfaCredentials.status })
    .from(auth.authMfaCredentials)
    .where(eq(auth.authMfaCredentials.identityId, record.identity.id))
    .limit(1);
  const mfaEnabled = mfa?.status === 'enabled';
  const [sessions] = await tx
    .select({ value: count() })
    .from(auth.authSessions)
    .where(
      and(
        eq(auth.authSessions.identityId, record.identity.id),
        isNull(auth.authSessions.revokedAt),
        gt(auth.authSessions.expiresAt, input.now),
      ),
    );

  return {
    membershipId: record.membership.id,
    businessId: record.membership.businessId,
    identityId: record.identity.id,
    displayName: record.identity.displayName,
    email: record.identity.emailNormalized ?? record.identity.email ?? '',
    state: record.membership.state,
    version: record.membership.version,
    mfaEnabled,
    grants: grants.map((grant) =>
      grantSummary(
        grant,
        isWorkforceGrantEffective({
          state: grant.state,
          role: grant.role as WorkforceRole,
          membershipState: record.membership.state,
          mfaEnabled,
          now: input.now,
          startsAt: grant.startsAt,
          endsAt: grant.endsAt,
        }),
      ),
    ),
    startedAt: record.membership.startedAt,
    suspendedAt: record.membership.suspendedAt,
    endedAt: record.membership.endedAt,
    activeSessionCount: sessions?.value ?? 0,
    createdAt: record.membership.createdAt,
    updatedAt: record.membership.updatedAt,
  };
};
