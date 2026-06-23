import { and, auth, eq, gt, sql, type Database } from '@pressly/db';
import type { LoginStore } from '../../../features/login/login.port.ts';
import { recordAuthAuditEvent } from '../../common/auth-audit.ts';
import {
  databaseFailure,
  toDatabaseResult,
} from '../../common/database-result.ts';
import { mapStoredRoles } from '../../common/roles.ts';

export const makeLoginStore = (db: Database): LoginStore => ({
  findIdentityByEmail: async (emailNormalized) =>
    toDatabaseResult(async () => {
      const [identity] = await db
        .select()
        .from(auth.authIdentities)
        .where(eq(auth.authIdentities.emailNormalized, emailNormalized))
        .limit(1);

      if (identity === undefined) return undefined;

      const roles = await db
        .select()
        .from(auth.authIdentityRoles)
        .where(eq(auth.authIdentityRoles.identityId, identity.id));

      return {
        id: identity.id,
        kind: identity.kind === 'service' ? 'service' : 'human',
        displayName: identity.displayName,
        ...(identity.email === null ? {} : { email: identity.email }),
        isActive: identity.isActive,
        roles: mapStoredRoles(roles),
      };
    }),

  findPasswordCredential: async (identityId) =>
    toDatabaseResult(async () => {
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
    toDatabaseResult(async () => {
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
    toDatabaseResult(async () => {
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

  recordLoginAttempt: async (input) =>
    toDatabaseResult(async () => {
      await db.insert(auth.authLoginAttempts).values(input);
    }),

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
