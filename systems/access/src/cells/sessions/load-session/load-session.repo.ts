import { type PostgresDatabase } from '@pressly/postgres/client';
import { and, eq, gt, isNull, lte, or, sql } from '@pressly/postgres/query';
import type { LoadSessionStore } from './load-session.port.ts';
import { runDatabaseOperation } from '../../../postgres/database-operation/database-operation.adapter.ts';
import { customerAudience } from '../../../model/authentication/public.ts';
import { mapStoredWorkforceAssignments } from './workforce-assignments.postgres.ts';
import type { AccessSchema } from '../../../schema/public.ts';

export const makeLoadSessionStore = (
  db: PostgresDatabase,
  auth: AccessSchema,
): LoadSessionStore => ({
  findByTokenHash: async (tokenHash) =>
    runDatabaseOperation(async () => {
      const [row] = await db
        .select({ session: auth.authSessions, identity: auth.authIdentities })
        .from(auth.authSessions)
        .innerJoin(
          auth.authIdentities,
          eq(auth.authSessions.identityId, auth.authIdentities.id),
        )
        .where(eq(auth.authSessions.tokenHash, tokenHash))
        .limit(1);

      if (row === undefined) return undefined;

      const workforceAssignments = await db
        .select({ grant: auth.authAccessGrants })
        .from(auth.authAccessGrants)
        .innerJoin(
          auth.workforceMemberships,
          and(
            eq(
              auth.workforceMemberships.id,
              auth.authAccessGrants.membershipId,
            ),
            eq(
              auth.workforceMemberships.businessId,
              auth.authAccessGrants.businessId,
            ),
            eq(
              auth.workforceMemberships.identityId,
              auth.authAccessGrants.identityId,
            ),
          ),
        )
        .where(
          and(
            eq(auth.authAccessGrants.identityId, row.identity.id),
            eq(auth.authAccessGrants.state, 'active'),
            eq(auth.workforceMemberships.state, 'active'),
            or(
              isNull(auth.authAccessGrants.startsAt),
              lte(auth.authAccessGrants.startsAt, sql`now()`),
            ),
            or(
              isNull(auth.authAccessGrants.endsAt),
              gt(auth.authAccessGrants.endsAt, sql`now()`),
            ),
          ),
        );
      const [mfa] = await db
        .select({ status: auth.authMfaCredentials.status })
        .from(auth.authMfaCredentials)
        .where(eq(auth.authMfaCredentials.identityId, row.identity.id))
        .limit(1);
      const effectiveWorkforceAssignments = workforceAssignments
        .map(({ grant }) => grant)
        .filter(
          (grant) =>
            grant.role === 'operator' ||
            ((grant.role === 'owner' || grant.role === 'manager') &&
              mfa?.status === 'enabled' &&
              row.session.assuranceLevel === 'mfa'),
        );
      return {
        sessionId: row.session.id,
        identityId: row.identity.id,
        kind: row.identity.kind === 'service' ? 'service' : 'human',
        displayName: row.identity.displayName,
        ...(row.identity.email === null ? {} : { email: row.identity.email }),
        ...customerAudience(row.identity.customerId),
        isActive: row.identity.isActive,
        assignments: mapStoredWorkforceAssignments(
          effectiveWorkforceAssignments,
        ),
        issuedAt: row.session.issuedAt,
        expiresAt: row.session.expiresAt,
        revokedAt: row.session.revokedAt,
        lastUsedAt: row.session.lastUsedAt,
        assuranceLevel: row.session.assuranceLevel,
      };
    }),

  touchSession: async (sessionId, now) =>
    runDatabaseOperation(async () => {
      await db
        .update(auth.authSessions)
        .set({ lastUsedAt: now })
        .where(eq(auth.authSessions.id, sessionId));
    }),
});
