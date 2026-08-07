import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type Database } from '@pressly/db/client';
import { eq, sql } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import * as business from '@pressly/db/schema/business';
import { makeLoginStore } from '../../../../src/features/sessions/login/login.repo.ts';
import { createAuthTestDatabase } from '../../../support/database.ts';

type AuthIdentityRow = typeof auth.authIdentities.$inferSelect;
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

  await db.insert(auth.authRoleAssignments).values(
    roles.map((role) => ({
      identityId,
      role,
      scopeKind: 'global' as const,
    })),
  );
};

describe('login repository integration', () => {
  it('loads compatible roles but ignores legacy workforce assignments', async () => {
    const identity = await insertIdentity(testDb.db);
    await insertRoles(testDb.db, identity.id, ['admin', 'operator']);
    const store = makeLoginStore(testDb.db);

    const actual = await store.findIdentityByEmail('admin@pressly.com');

    const value = actual;

    expect(value).toMatchObject({
      id: identity.id,
      kind: 'human',
      displayName: 'Admin User',
      email: 'admin@pressly.com',
      isActive: true,
    });
    expect(value?.roles).toEqual(['admin']);
  });

  it('rejects roles outside the auth role enum', async () => {
    const identity = await insertIdentity(testDb.db);

    await expect(
      testDb.db.execute(sql`
        insert into auth_role_assignments (identity_id, role, scope_kind)
        values (${identity.id}, ${'not-a-real-role'}, 'global')
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

    const actual = await store.findIdentityByEmail('ci@pressly.com');

    expect(actual).toMatchObject({
      id: identity.id,
      kind: 'service',
      displayName: 'CI Worker',
      email: 'ci@pressly.com',
      isActive: true,
      roles: expect.arrayContaining(['service', 'ci']),
    });
  });

  it('treats a null workforce grant start as effective immediately', async () => {
    const identity = await insertIdentity(testDb.db);
    const [businessAccount] = await testDb.db
      .insert(business.businessAccounts)
      .values({
        slug: `null-start-${identity.id}`,
        displayName: 'Null Start Workforce',
      })
      .returning();
    if (businessAccount === undefined)
      throw new Error('Business account was not inserted.');
    const [membership] = await testDb.db
      .insert(auth.workforceMemberships)
      .values({
        businessId: businessAccount.id,
        identityId: identity.id,
      })
      .returning();
    if (membership === undefined)
      throw new Error('Workforce membership was not inserted.');
    await testDb.db.insert(auth.authAccessGrants).values({
      businessId: businessAccount.id,
      membershipId: membership.id,
      identityId: identity.id,
      role: 'owner',
      scopeKind: 'business',
      scopeId: businessAccount.id,
      startsAt: null,
      createdByIdentityId: identity.id,
    });
    const store = makeLoginStore(testDb.db);

    const actual = await store.findIdentityByEmail('admin@pressly.com');

    expect(actual?.roles).toContain('owner');
  });

  it('returns undefined when no identity or password credential exists', async () => {
    const store = makeLoginStore(testDb.db);

    const missingIdentity = await store.findIdentityByEmail(
      'missing@pressly.com',
    );
    const missingCredential = await store.findPasswordCredential(
      '00000000-0000-4000-8000-000000000001',
    );

    expect(missingIdentity).toBeUndefined();
    expect(missingCredential).toBeUndefined();
  });

  it('loads password credentials by identity id', async () => {
    const identity = await insertIdentity(testDb.db);
    await testDb.db.insert(auth.authPasswordCredentials).values({
      identityId: identity.id,
      passwordHash: 'stored-password-hash',
    });
    const store = makeLoginStore(testDb.db);

    const actual = await store.findPasswordCredential(identity.id);

    expect(actual).toEqual({
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

    const actual = await store.countRecentFailedAttempts({
      emailNormalized: 'admin@pressly.com',
      since: new Date('2026-05-29T12:00:00.000Z'),
    });

    expect(actual).toBe(1);
  });

  it('creates sessions and returns persisted session timestamps', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeLoginStore(testDb.db);
    const issuedAt = new Date('2026-05-29T12:00:00.000Z');
    const expiresAt = new Date('2026-05-29T12:30:00.000Z');

    const actual = await store.createSession({
      identityId: identity.id,
      tokenHash: 'token-hash-1',
      issuedAt,
      expiresAt,
      lastUsedAt: issuedAt,
      assuranceLevel: 'password',
    });

    const value = actual;
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

    await store.recordLoginAttempt({
      emailNormalized: 'admin@pressly.com',
      identityId: identity.id,
      success: false,
      failureCode: 'invalid_credentials',
      ipAddress: '203.0.113.10',
      userAgent: 'PresslyTests/1.0',
    });

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

    await store.recordAuditEvent({
      principalIdentityId: identity.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session_1',
      metadata: { email: 'admin@pressly.com' },
    });

    const [auditEvent] = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(eq(auth.authAuditEvents.eventType, 'auth.login.succeeded'));

    expect(auditEvent).toMatchObject({
      principalIdentityId: identity.id,
      eventType: 'auth.login.succeeded',
      resourceType: 'auth_session',
      resourceId: 'session_1',
      metadata: { email: 'admin@pressly.com' },
    });
  });

  it('throws database errors', async () => {
    const identity = await insertIdentity(testDb.db);
    const store = makeLoginStore(testDb.db);
    const issuedAt = new Date('2026-05-29T12:00:00.000Z');
    const expiresAt = new Date('2026-05-29T12:30:00.000Z');

    await store.createSession({
      identityId: identity.id,
      tokenHash: 'duplicate-token-hash',
      issuedAt,
      expiresAt,
      lastUsedAt: issuedAt,
      assuranceLevel: 'password',
    });

    await expect(
      store.createSession({
        identityId: identity.id,
        tokenHash: 'duplicate-token-hash',
        issuedAt,
        expiresAt,
        lastUsedAt: issuedAt,
        assuranceLevel: 'password',
      }),
    ).rejects.toMatchObject({ code: 'auth_database_failed' });
  });
});
