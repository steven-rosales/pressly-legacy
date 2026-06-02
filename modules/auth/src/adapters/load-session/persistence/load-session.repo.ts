import { isRole, type Role } from '@pressly/auth';
import { auth, eq, type Database } from '@pressly/db';
import {
  err,
  isAppError,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';
import type { LoadSessionStore } from '../../../features/load-session/load-session.port.ts';

const databaseFailure = (cause: unknown): AppError =>
  makeAppError({
    kind: 'DatabaseError',
    code: 'auth_database_field',
    message: 'Auth database operation failed.',
    safeMessage: 'Authentication could not be completed.',
    status: 500,
    cause,
  });

const toDatabaseResult = async <T>(
  work: () => Promise<T>,
): Promise<Result<T, AppError>> => {
  try {
    return ok(await work());
  } catch (error) {
    return err(isAppError(error) ? error : databaseFailure(error));
  }
};

const mapStoredRoles = (rows: readonly { role: string }[]): Role[] =>
  rows.map((row) => row.role).filter(isRole);

export const makeLoadSessionStore = (db: Database): LoadSessionStore => ({
  findByTokenHash: async (tokenHash) =>
    toDatabaseResult(async () => {
      const [row] = await db
        .select({
          session: auth.authSessions,
          identity: auth.authIdentities,
        })
        .from(auth.authSessions)
        .innerJoin(
          auth.authIdentities,
          eq(auth.authSessions.identityId, auth.authIdentities.id),
        )
        .where(eq(auth.authSessions.tokenHash, tokenHash))
        .limit(1);

      if (row === undefined) return undefined;

      const roles = await db
        .select()
        .from(auth.authIdentityRoles)
        .where(eq(auth.authIdentityRoles.identityId, row.identity.id));

      return {
        sessionId: row.session.id,
        identityId: row.identity.id,
        kind: row.identity.kind === 'service' ? 'service' : 'human',
        displayName: row.identity.displayName,
        ...(row.identity.email === null ? {} : { email: row.identity.email }),
        isActive: row.identity.isActive,
        roles: mapStoredRoles(roles),
        issuedAt: row.session.issuedAt,
        expiresAt: row.session.expiresAt,
        revokedAt: row.session.revokedAt,
      };
    }),

  touchSession: async (sessionId, now) =>
    toDatabaseResult(async () => {
      await db
        .update(auth.authSessions)
        .set({ lastUsedAt: now })
        .where(eq(auth.authSessions.id, sessionId));
    }),
});
