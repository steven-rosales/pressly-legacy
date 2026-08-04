import { type Database } from '@pressly/db/client';
import { and, eq, gt, isNull, lte, ne, or, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import type { LoginStore } from './login.port.ts';
import { recordAuthAuditEvent } from '../../../foundations/adapters/postgres/identity-store/auth-audit.repo.ts';
import {
  databaseFailure,
  runDatabaseOperation,
} from '../../../foundations/adapters/postgres/identity-store/database-result.adapter.ts';
import { mapStoredRoles } from '../../../foundations/adapters/postgres/identity-store/stored-roles.persistence.mapper.ts';

export const makeLoginStore = (db: Database): LoginStore => ({
  findIdentityByEmail: async (emailNormalized) =>
    runDatabaseOperation(async () => {
      const [identity] = await db
        .select()
        .from(auth.authIdentities)
        .where(eq(auth.authIdentities.emailNormalized, emailNormalized))
        .limit(1);

      if (identity === undefined) return undefined;

      const [workforceGrants, compatibilityRoles, mfaCredentials] =
        await Promise.all([
          db
            .select({ role: auth.authAccessGrants.role })
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
                eq(auth.authAccessGrants.identityId, identity.id),
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
            ),
          db
            .select()
            .from(auth.authRoleAssignments)
            .where(
              and(
                eq(auth.authRoleAssignments.identityId, identity.id),
                ne(auth.authRoleAssignments.role, 'owner'),
                ne(auth.authRoleAssignments.role, 'manager'),
                ne(auth.authRoleAssignments.role, 'operator'),
              ),
            ),
          db
            .select({ status: auth.authMfaCredentials.status })
            .from(auth.authMfaCredentials)
            .where(eq(auth.authMfaCredentials.identityId, identity.id))
            .limit(1),
        ]);

      return {
        id: identity.id,
        kind: identity.kind === 'service' ? 'service' : 'human',
        displayName: identity.displayName,
        ...(identity.email === null ? {} : { email: identity.email }),
        isActive: identity.isActive,
        roles: mapStoredRoles([...workforceGrants, ...compatibilityRoles]),
        mfaEnabled: mfaCredentials[0]?.status === 'enabled',
      };
    }),

  findPasswordCredential: async (identityId) =>
    runDatabaseOperation(async () => {
      const [credential] = await db
        .select()
        .from(auth.authPasswordCredentials)
        .where(eq(auth.authPasswordCredentials.identityId, identityId))
        .limit(1);

      if (credential === undefined) return undefined;

      return {
        identityId: credential.identityId,
        passwordHash: credential.passwordHash,
      };
    }),

  countRecentFailedAttempts: async ({ emailNormalized, since }) =>
    runDatabaseOperation(async () => {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auth.authLoginAttempts)
        .where(
          and(
            eq(auth.authLoginAttempts.emailNormalized, emailNormalized),
            eq(auth.authLoginAttempts.success, false),
            gt(auth.authLoginAttempts.createdAt, since),
          ),
        );

      return row?.count ?? 0;
    }),

  createSession: async (input) =>
    runDatabaseOperation(async () => {
      const [session] = await db
        .insert(auth.authSessions)
        .values(input)
        .returning();

      if (session === undefined)
        throw databaseFailure('auth session insert returned no row');

      return {
        id: session.id,
        issuedAt: session.issuedAt,
        expiresAt: session.expiresAt,
      };
    }),

  createMfaChallenge: async (input) =>
    runDatabaseOperation(async () => {
      await db.insert(auth.authMfaChallenges).values(input);
    }),

  recordLoginAttempt: async (input) =>
    runDatabaseOperation(async () => {
      await db.insert(auth.authLoginAttempts).values(input);
    }),

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
