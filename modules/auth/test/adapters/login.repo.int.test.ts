import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, eq, sql, type Database } from '@pressly/db';
import { expectErrCode, expectOk } from '@pressly/testkit/result';
import { makeLoginStore } from '../../src/adapters/login/persistence/login.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

type AuthIdentityRow = typeof auth.authIdentities.$inferSelect;
type AuthRole = typeof auth.authIdentityRoles.$inferInsert.role;

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
      email: input.email ?? 'admin@pressly.com',
      emailNormalized: input.emailNormalized ?? 'admin@pressly.com',
      isActive: input.isActive ?? true,
      ...(input.id === undefined ? {} : { id: input.id }),
    })
    .returning();

  return identity ?? missingReturnedRow('Auth identity was not inserted.');
};

const insertRoles = async (
  db: Database,
  identityId: string,
  roles: readonly AuthRole[],
): Promise<void> => {
  if (roles.length === 0) return;

  await db.insert(auth.authIdentityRoles).values(
    roles.map((role) => ({
      identityId,
      role,
    })),
  );
};

describe('login repository integration', () => {
  it('loads an identity by normalized email with valid stored roles', async () => {
    const identity = await insertIdentity(testDb.db);
    await insertRoles(testDb.db, identity.id, ['admin', 'operator']);
    const store = makeLoginStore(testDb.db);

    const result = await store.findIdentityByEmail('admin@pressly.com');

    const value = expectOk(result);

    expect(value).toMatchObject({
      id: identity.id,
      kind: 'human',
      displayName: 'Admin User',
      email: 'admin@pressly.com',
      isActive: true,
    });
    expect(value?.roles).toEqual(expect.arrayContaining(['admin', 'operator']));
    expect(value?.roles).toHaveLength(2);
  });

  it('rejects roles outside the auth role enum', async () => {
    const identity = await insertIdentity(testDb.db);

    await expect(
      testDb.db.execute(sql`
        insert into auth_identity_roles (identity_id, role)
        values (${identity.id}, ${'not-a-real-role'})
      `),
    ).rejects.toThrow();
  });

  it('loads service identities with the service kind', async () => {
    const identity = await insertIdentity(testDb.db, {
      kind: 'service',
      displayName: 'CI Worker',
      email: 'ci@pressly.com',
      emailNormalized: 'ci@pressly.com',
    });
    await insertRoles(testDb.db, identity.id, ['service', 'ci']);
    const store = makeLoginStore(testDb.db);

    const result = await store.findIdentityByEmail('ci@pressly.com');

    expect(expectOk(result)).toMatchObject({
      id: identity.id,
      kind: 'service',
      displayName: 'CI Worker',
      email: 'ci@pressly.com',
      isActive: true,
      roles: expect.arrayContaining(['service', 'ci']),
    });
  });

  it('returns undefined when no identity or password credential exists', async () => {
    const store = makeLoginStore(testDb.db);

    const missingIdentity = await store.findIdentityByEmail(
      'missing@pressly.com',
    );
    const missingCredential = await store.findPasswordCredential(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(expectOk(missingIdentity)).toBeUndefined();
    expect(expectOk(missingCredential)).toBeUndefined();
  });

  it('loads password credentials by identity id', async () => {
    const identity = await insertIdentity(testDb.db);
    await testDb.db.insert(auth.authPasswordCredentials).values({
      identityId: identity.id,
      passwordHash: 'stored-password-hash',
    });
    const store = makeLoginStore(testDb.db);

    const result = await store.findPasswordCredential(identity.id);

    expect(expectOk(result)).toEqual({
      identityId: identity.id,
      passwordHash: 'stored-password-hash',
    });
  });

  it('counts only recent failed attempts for the normalized email', async () => {
    const identity = await insertIdentity(testDb.db);
    await testDb.db.insert(auth.authLoginAttempts).values([
      {
        emailNormalized: 'admin@pressly.com',
        identityId: identity.id,
        success: false,
        failureCode: 'invalid_credentials',
        createdAt: new Date('2026-05-29T12:01:00.000Z'),
      },
      {
        emailNormalized: 'admin@pressly.com',
        identityId: identity.id,
        success: false,
        failureCode: 'invalid_credentials',
        createdAt: new Date('2026-05-29T12:00:00.000Z'),
      },
      {
        emailNormalized: 'admin@pressly.com',
        identityId: identity.id,
        success: true,
        createdAt: new Date('2026-05-29T12:02:00.000Z'),
      },
      {
        emailNormalized: 'other@pressly.com',
        success: false,
        failureCode: 'invalid_credentials',
        createdAt: new Date('2026-05-29T12:03:00.000Z'),
      },
    ]);
    const store = makeLoginStore(testDb.db);

    const result = await store.countRecentFailedAttempts({
      emailNormalized: 'admin@pressly.com',
      since: new Date('2026-05-29T12:00:00.000Z'),
    });

    expect(expectOk(result)).toBe(1);
  });

  it('creates sessions and returns persisted session timestamps', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeLoginStore(testDb.db);
    const issuedAt = new Date('2026-05-29T12:00:00.000Z');
    const expiresAt = new Date('2026-05-29T12:30:00.000Z');

    const result = await store.createSession({
      identityId: identity.id,
      tokenHash: 'token-hash-1',
      issuedAt,
      expiresAt,
    });

    const value = expectOk(result);
    const [session] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, value.id));

    expect(value).toEqual({
      id: expect.any(String),
      issuedAt,
      expiresAt,
    });
    expect(session).toMatchObject({
      id: value.id,
      identityId: identity.id,
      tokenHash: 'token-hash-1',
      issuedAt,
      expiresAt,
    });
  });

  it('records login attempts with optional request metadata', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeLoginStore(testDb.db);

    const result = await store.recordLoginAttempt({
      emailNormalized: 'admin@pressly.com',
      identityId: identity.id,
      success: false,
      failureCode: 'invalid_credentials',
      ipAddress: '203.0.113.10',
      userAgent: 'PresslyTests/1.0',
    });

    expectOk(result);

    const [attempt] = await testDb.db
      .select()
      .from(auth.authLoginAttempts)
      .where(eq(auth.authLoginAttempts.emailNormalized, 'admin@pressly.com'));

    expect(attempt).toMatchObject({
      emailNormalized: 'admin@pressly.com',
      identityId: identity.id,
      success: false,
      failureCode: 'invalid_credentials',
      ipAddress: '203.0.113.10',
      userAgent: 'PresslyTests/1.0',
    });
  });

  it('records auth audit events', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeLoginStore(testDb.db);

    const result = await store.recordAuditEvent({
      actorIdentityId: identity.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session_1',
      metadata: { email: 'admin@pressly.com' },
    });

    expectOk(result);

    const [auditEvent] = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(eq(auth.authAuditEvents.eventType, 'auth.login.succeeded'));

    expect(auditEvent).toMatchObject({
      actorIdentityId: identity.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session_1',
      metadata: { email: 'admin@pressly.com' },
    });
  });

  it('returns database errors as result failures', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeLoginStore(testDb.db);
    const issuedAt = new Date('2026-05-29T12:00:00.000Z');
    const expiresAt = new Date('2026-05-29T12:30:00.000Z');

    expectOk(
      await store.createSession({
        identityId: identity.id,
        tokenHash: 'duplicate-token-hash',
        issuedAt,
        expiresAt,
      }),
    );

    const result = await store.createSession({
      identityId: identity.id,
      tokenHash: 'duplicate-token-hash',
      issuedAt,
      expiresAt,
    });

    expectErrCode(result, 'auth_database_field');
  });
});
