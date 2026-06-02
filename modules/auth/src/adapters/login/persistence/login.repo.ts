import { isRole, type Role } from '@pressly/auth';
import { and, auth, eq, gt, sql, type Database } from '@pressly/db';
import {
  err,
  isAppError,
  makeAppError,
  ok,
  type AppError,
  type Result,
} from '@pressly/errors';
import type {
  AuthAuditEventInput,
  LoginAttemptInput,
  LoginStore,
} from '../../../features/login/login.port.ts';

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

const recordAuthAuditEvent = (
  db: Database,
  input: AuthAuditEventInput,
): Promise<Result<void, AppError>> =>
  toDatabaseResult(async () => {
    await db
      .insert(auth.authAuditEvents)
      .values({ ...input, metadata: input.metadata });
  });

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

  recordLoginAttempt: async (input: LoginAttemptInput) =>
    toDatabaseResult(async () => {
      await db.insert(auth.authLoginAttempts).values(input);
    }),

  recordAuditEvent: async (input) => recordAuthAuditEvent(db, input),
});
