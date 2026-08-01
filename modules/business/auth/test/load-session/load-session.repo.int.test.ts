import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, business, eq, type Database } from '@pressly/db';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makeLoadSessionStore } from '../../src/load-session/load-session.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

type AuthIdentityRow = typeof auth.authIdentities.$inferSelect;
type AuthSessionRow = typeof auth.authSessions.$inferSelect;
type AuthRole = typeof auth.authRoleAssignments.$inferInsert.role;

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

const insertGlobalAssignments = async (
  db: Database,
  identityId: string,
  roles: readonly AuthRole[],
): Promise<void> => {
  if (roles.length === 0) return;

  await db.insert(auth.authRoleAssignments).values(
    roles.map((role) => ({
      identityId,
      role,
      scopeKind: 'global' as const,
    })),
  );
};

const insertSession = async (
  db: Database,
  input: Pick<
    typeof auth.authSessions.$inferInsert,
    'identityId' | 'tokenHash' | 'issuedAt' | 'expiresAt'
  > &
    Partial<
      Pick<AuthSessionRow, 'id' | 'revokedAt' | 'lastUsedAt' | 'assuranceLevel'>
    >,
): Promise<AuthSessionRow> => {
  const [session] = await db
    .insert(auth.authSessions)
    .values({
      identityId: input.identityId,
      tokenHash: input.tokenHash,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      ...(input.assuranceLevel === undefined
        ? {}
        : { assuranceLevel: input.assuranceLevel }),
      ...(input.id === undefined ? {} : { id: input.id }),
      ...(input.revokedAt === undefined ? {} : { revokedAt: input.revokedAt }),
      ...(input.lastUsedAt === undefined
        ? {}
        : { lastUsedAt: input.lastUsedAt }),
    })
    .returning();

  return session ?? missingReturnedRow('Auth session was not inserted.');
};

describe('load session repository integration', () => {
  it('loads a stored session and ignores legacy workforce assignments', async () => {
    const identity = await insertIdentity(testDb.db);
    await insertGlobalAssignments(testDb.db, identity.id, [
      'admin',
      'operator',
    ]);
    const issuedAt = new Date('2026-05-29T12:00:00.000Z');
    const expiresAt = new Date('2026-05-29T12:30:00.000Z');
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'token-hash-1',
      issuedAt,
      expiresAt,
    });
    const store = makeLoadSessionStore(testDb.db);

    const actual = await store.findByTokenHash('token-hash-1');

    const value = expectOk(actual);

    expect(value).toMatchObject({
      sessionId: session.id,
      identityId: identity.id,
      kind: 'human',
      displayName: 'Admin User',
      email: 'admin@pressly.com',
      isActive: true,
      issuedAt,
      expiresAt,
      revokedAt: null,
    });
    expect(value?.assignments).toEqual([
      { role: 'admin', scope: { kind: 'global', id: '*' } },
    ]);
  });

  it('returns undefined when no session exists for the token hash', async () => {
    const store = makeLoadSessionStore(testDb.db);

    const actual = await store.findByTokenHash('missing-token-hash');

    expect(expectOk(actual)).toBeUndefined();
  });

  it('loads service identities without email addresses', async () => {
    const identity = await insertIdentity(testDb.db, {
      kind: 'service',
      displayName: 'Background Worker',
      email: null,
      emailNormalized: null,
    });
    await insertGlobalAssignments(testDb.db, identity.id, ['service', 'ci']);
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'service-token-hash',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
    });
    const store = makeLoadSessionStore(testDb.db);

    const actual = await store.findByTokenHash('service-token-hash');

    const value = expectOk(actual);

    expect(value).toMatchObject({
      sessionId: session.id,
      identityId: identity.id,
      kind: 'service',
      displayName: 'Background Worker',
      isActive: true,
    });
    expect(value?.assignments).toEqual(
      expect.arrayContaining([
        { role: 'service', scope: { kind: 'global', id: '*' } },
        { role: 'ci', scope: { kind: 'global', id: '*' } },
      ]),
    );
    expect(value).not.toHaveProperty('email');
  });

  it('preserves inactive identities and revoked sessions for the use case to reject', async () => {
    const identity = await insertIdentity(testDb.db, { isActive: false });
    await insertGlobalAssignments(testDb.db, identity.id, ['admin']);
    const revokedAt = new Date('2026-05-29T12:10:00.000Z');
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'revoked-token-hash',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
      revokedAt,
    });
    const store = makeLoadSessionStore(testDb.db);

    const actual = await store.findByTokenHash('revoked-token-hash');

    expect(expectOk(actual)).toMatchObject({
      sessionId: session.id,
      identityId: identity.id,
      isActive: false,
      revokedAt,
    });
  });

  it('returns the persisted business grant without fabricating location grants', async () => {
    const identity = await insertIdentity(testDb.db);
    const [assignedBusiness] = await testDb.db
      .insert(business.businessAccounts)
      .values({
        slug: `assigned-${identity.id}`,
        displayName: 'Assigned business',
      })
      .returning();
    if (assignedBusiness === undefined)
      throw new Error('Business account was not inserted.');
    const [membership] = await testDb.db
      .insert(auth.workforceMemberships)
      .values({
        businessId: assignedBusiness.id,
        identityId: identity.id,
      })
      .returning();
    if (membership === undefined)
      throw new Error('Workforce membership was not inserted.');
    await testDb.db.insert(auth.authAccessGrants).values({
      businessId: assignedBusiness.id,
      membershipId: membership.id,
      identityId: identity.id,
      role: 'owner',
      scopeKind: 'business',
      scopeId: assignedBusiness.id,
      createdByIdentityId: identity.id,
    });
    await testDb.db.insert(auth.authMfaCredentials).values({
      identityId: identity.id,
      encryptedSecret: 'encrypted-test-secret',
      status: 'enabled',
      enabledAt: new Date('2026-05-29T11:55:00.000Z'),
    });
    await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'business-location-expansion',
      assuranceLevel: 'mfa',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
    });

    const value = expectOk(
      await makeLoadSessionStore(testDb.db).findByTokenHash(
        'business-location-expansion',
      ),
    );

    expect(value?.assignments).toEqual([
      {
        role: 'owner',
        scope: { kind: 'business', id: assignedBusiness.id },
        state: 'active',
        version: 1,
      },
    ]);
    expect(
      value?.assignments.some(
        (assignment) => assignment.scope.kind === 'location',
      ),
    ).toBe(false);
  });

  it('updates last_used_at when a session is touched', async () => {
    const identity = await insertIdentity(testDb.db);
    const session = await insertSession(testDb.db, {
      identityId: identity.id,
      tokenHash: 'touch-token-hash',
      issuedAt: new Date('2026-05-29T12:00:00.000Z'),
      expiresAt: new Date('2026-05-29T12:30:00.000Z'),
    });
    const store = makeLoadSessionStore(testDb.db);
    const touchedAt = new Date('2026-05-29T12:15:00.000Z');

    const actual = await store.touchSession(session.id, touchedAt);

    expectOk(actual);

    const [updatedSession] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, session.id));

    expect(updatedSession?.lastUsedAt).toEqual(touchedAt);
  });

  it('returns database errors as result failures', async () => {
    const store = makeLoadSessionStore(testDb.db);

    const actual = await store.touchSession('not-a-session-id', new Date());

    expectErrCode(actual, 'auth_database_failed');
  });
});
