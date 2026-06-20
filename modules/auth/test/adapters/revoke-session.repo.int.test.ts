import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, eq, type Database } from '@pressly/db';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makeRevokeSessionStore } from '../../src/adapters/revoke-session/persistence/revoke-session.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

type AuthIdentityRow = typeof auth.authIdentities.$inferSelect;
type AuthSessionRow = typeof auth.authSessions.$inferSelect;

const testDb = createAuthTestDatabase();

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const missingReturnedRow = (message: string): never => {
  throw new Error(message);
};

const insertIdentity = async (
  db: Database,
  input: Partial<
    Pick<
      AuthIdentityRow,
      'id' | 'kind' | 'displayName' | 'email' | 'emailNormalized' | 'isActive'
    >
  > = {},
): Promise<AuthIdentityRow> => {
  const [identity] = await db
    .insert(auth.authIdentities)
    .values({
      kind: input.kind ?? 'human',
      displayName: input.displayName ?? 'Admin User',
      email: 'email' in input ? input.email : 'admin@pressly.com',
      emailNormalized:
        'emailNormalized' in input
          ? input.emailNormalized
          : 'admin@pressly.com',
      isActive: input.isActive ?? true,
      ...(input.id === undefined ? {} : { id: input.id }),
    })
    .returning();

  return identity ?? missingReturnedRow('Auth identity was not inserted.');
};

const insertSession = async (
  db: Database,
  input: Pick<
    typeof auth.authSessions.$inferInsert,
    'identityId' | 'tokenHash' | 'issuedAt' | 'expiresAt'
  > &
    Partial<Pick<AuthSessionRow, 'id' | 'revokedAt' | 'lastUsedAt'>>,
): Promise<AuthSessionRow> => {
  const [session] = await db
    .insert(auth.authSessions)
    .values({
      identityId: input.identityId,
      tokenHash: input.tokenHash,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      ...(input.id === undefined ? {} : { id: input.id }),
      ...(input.revokedAt === undefined ? {} : { revokedAt: input.revokedAt }),
      ...(input.lastUsedAt === undefined
        ? {}
        : { lastUsedAt: input.lastUsedAt }),
    })
    .returning();

  return session ?? missingReturnedRow('Auth session was not inserted.');
};

describe('revoke session repository integration', () => {
  it('revokes an active session by token hash', async () => {
    const identity = await insertIdentity(testDb.db);
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'token-hash-1',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
    });
    const store = makeRevokeSessionStore(testDb.db);
    const revokedAt = new Date('2026-05-29T12:15:00.000Z');

    const actual = await store.revokeByTokenHash('token-hash-1', revokedAt);

    expect(expectOk(actual)).toEqual({
      sessionId: session.id,
      identityId: identity.id,
    });

    const [updatedSession] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, session.id));

    expect(updatedSession?.revokedAt).toEqual(revokedAt);
  });

  it('returns an empty revocation when no session matches the token hash', async () => {
    const store = makeRevokeSessionStore(testDb.db);

    const actual = await store.revokeByTokenHash(
      'missing-token-hash',
      new Date('2026-05-29T12:15:00.000Z'),
    );

    expect(expectOk(actual)).toEqual({});
  });

  it('does not revoke an already revoked session again', async () => {
    const identity = await insertIdentity(testDb.db);
    const existingRevokedAt = new Date('2026-05-29T12:10:00.000Z');
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'already-revoked-token-hash',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
      revokedAt: existingRevokedAt,
    });
    const store = makeRevokeSessionStore(testDb.db);

    const actual = await store.revokeByTokenHash(
      'already-revoked-token-hash',
      new Date('2026-05-29T12:15:00.000Z'),
    );

    expect(expectOk(actual)).toEqual({});

    const [updatedSession] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, session.id));

    expect(updatedSession?.revokedAt).toEqual(existingRevokedAt);
  });

  it('does not revoke an expired session', async () => {
    const identity = await insertIdentity(testDb.db);
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'expired-token-hash',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:10:00.000Z'),
    });
    const store = makeRevokeSessionStore(testDb.db);

    const actual = await store.revokeByTokenHash(
      'expired-token-hash',
      new Date('2026-05-29T12:15:00.000Z'),
    );

    expect(expectOk(actual)).toEqual({});

    const [updatedSession] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, session.id));

    expect(updatedSession?.revokedAt).toBeNull();
  });

  it('records auth audit events', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeRevokeSessionStore(testDb.db);

    const actual = await store.recordAuditEvent({
      actorIdentityId: identity.id,
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      resourceId: 'session_1',
      metadata: { reason: 'user_logout' },
    });

    expectOk(actual);

    const [auditEvent] = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(eq(auth.authAuditEvents.eventType, 'auth.logout'));

    expect(auditEvent).toMatchObject({
      actorIdentityId: identity.id,
      eventType: 'auth.logout',
      resourceType: 'auth_session',
      resourceId: 'session_1',
      metadata: { reason: 'user_logout' },
    });
  });

  it('returns database errors as result failures', async () => {
    const store = makeRevokeSessionStore(testDb.db);

    const actual = await store.recordAuditEvent({
      actorIdentityId: 'not-a-uuid',
      eventType: 'auth.logout',
      resourceType: 'auth_session',
    });

    expectErrCode(actual, 'auth_database_failed');
  });
});
