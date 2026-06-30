import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auth, eq, type Database } from '@pressly/db';
import { expectOk } from '@pressly/testkit/result';
import { makeBootstrapOwnerStore } from '../../src/adapters/bootstrap-owner/persistence/bootstrap-owner.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

type AuthIdentityRow = typeof auth.authIdentities.$inferSelect;

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
      displayName: input.displayName ?? 'Existing Owner',
      email: input.email ?? 'owner@pressly.com',
      emailNormalized: input.emailNormalized ?? 'owner@pressly.com',
      isActive: input.isActive ?? true,
      ...(input.id === undefined ? {} : { id: input.id }),
    })
    .returning();

  return identity ?? missingReturnedRow('Auth identity was not inserted.');
};

describe('bootstrap owner repository integration', () => {
  it('creates the first owner identity, credential, role assignment, and audit event', async () => {
    const store = makeBootstrapOwnerStore(testDb.db);

    const actual = await store.createFirstOwner({
      email: 'Steven@Pressly.COM',
      emailNormalized: 'steven@pressly.com',
      passwordHash: 'stored-password-hash',
    });

    const value = expectOk(actual);

    expect(value).toMatchObject({ status: 'created' });

    if (value.status !== 'created')
      throw new Error('Expected created bootstrap result.');

    const [identity] = await testDb.db
      .select()
      .from(auth.authIdentities)
      .where(eq(auth.authIdentities.id, value.identityId));

    expect(identity).toMatchObject({
      kind: 'human',
      displayName: 'Steven@Pressly.COM',
      email: 'Steven@Pressly.COM',
      emailNormalized: 'steven@pressly.com',
      isActive: true,
    });

    const [credential] = await testDb.db
      .select()
      .from(auth.authPasswordCredentials)
      .where(eq(auth.authPasswordCredentials.identityId, value.identityId));

    expect(credential?.passwordHash).toBe('stored-password-hash');

    const [assignment] = await testDb.db
      .select()
      .from(auth.authRoleAssignments)
      .where(eq(auth.authRoleAssignments.identityId, value.identityId));

    expect(assignment).toMatchObject({
      role: 'owner',
      scopeKind: 'global',
      scopeId: '*',
      scopeResourceType: '*',
    });

    const [auditEvent] = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(eq(auth.authAuditEvents.eventType, 'auth.owner_bootstrapped'));

    expect(auditEvent).toMatchObject({
      principalIdentityId: null,
      resourceType: 'auth_identity',
      resourceId: value.identityId,
      metadata: { email: 'steven@pressly.com', role: 'owner' },
    });
  });

  it('does not create anything when an owner already exists', async () => {
    const existingOwner = await insertIdentity(testDb.db);

    await testDb.db.insert(auth.authRoleAssignments).values({
      identityId: existingOwner.id,
      role: 'owner',
      scopeKind: 'global',
    });

    const store = makeBootstrapOwnerStore(testDb.db);

    const actual = await store.createFirstOwner({
      email: 'NewOwner@Pressly.COM',
      emailNormalized: 'newowner@pressly.com',
      passwordHash: 'stored-password-hash',
    });

    expect(expectOk(actual)).toEqual({ status: 'owner_exists' });

    const newIdentities = await testDb.db
      .select()
      .from(auth.authIdentities)
      .where(eq(auth.authIdentities.emailNormalized, 'newowner@pressly.com'));

    expect(newIdentities).toHaveLength(0);
  });

  it('does not modify an existing identity when the bootstrap email already exists', async () => {
    const identity = await insertIdentity(testDb.db, {
      displayName: 'Existing User',
      email: 'steven@pressly.com',
      emailNormalized: 'steven@pressly.com',
      isActive: false,
    });
    const store = makeBootstrapOwnerStore(testDb.db);

    const actual = await store.createFirstOwner({
      email: 'Steven@Pressly.COM',
      emailNormalized: 'steven@pressly.com',
      passwordHash: 'stored-password-hash',
    });

    expect(expectOk(actual)).toEqual({ status: 'identity_exists' });

    const credentials = await testDb.db
      .select()
      .from(auth.authPasswordCredentials)
      .where(eq(auth.authPasswordCredentials.identityId, identity.id));

    const assignments = await testDb.db
      .select()
      .from(auth.authRoleAssignments)
      .where(eq(auth.authRoleAssignments.identityId, identity.id));

    const [unchangedIdentity] = await testDb.db
      .select()
      .from(auth.authIdentities)
      .where(eq(auth.authIdentities.id, identity.id));

    expect(credentials).toHaveLength(0);
    expect(assignments).toHaveLength(0);
    expect(unchangedIdentity).toMatchObject({
      displayName: 'Existing User',
      isActive: false,
    });
  });
});
