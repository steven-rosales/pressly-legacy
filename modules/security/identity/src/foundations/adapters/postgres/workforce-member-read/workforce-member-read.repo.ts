import type { DatabaseTransaction } from '@pressly/db/client';
import { and, count, eq, gt, isNull } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { grantSummary } from '../access-grant-read/access-grant.persistence.mapper.ts';
import { isWorkforceGrantEffective } from '../../../language/workforce-authority/workforce-authority.policy.ts';
import type { WorkforceMemberDetail } from '../../../language/workforce-membership/workforce-membership.model.ts';
import type { WorkforceRole } from '../../../language/workforce/workforce.model.ts';

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
