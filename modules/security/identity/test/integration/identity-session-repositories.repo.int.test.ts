import { eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeListIdentitySessionsStore } from '../../src/features/sessions/list-identity-sessions/list-identity-sessions.repo.ts';
import { makeRevokeIdentitySessionsStore } from '../../src/features/sessions/revoke-identity-sessions/revoke-identity-sessions.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

const testDb = createAuthTestDatabase();
const now = new Date('2026-06-29T12:00:00.000Z');

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const insertIdentity = async (email: string): Promise<string> => {
  const [identity] = await testDb.db
    .insert(auth.authIdentities)
    .values({
      kind: 'human',
      displayName: email,
      email,
      emailNormalized: email,
    })
    .returning({ id: auth.authIdentities.id });

  if (identity === undefined) throw new Error('Expected identity insert.');
  return identity.id;
};

const insertSession = async (identityId: string, tokenHash: string) => {
  const [session] = await testDb.db
    .insert(auth.authSessions)
    .values({
      identityId,
      tokenHash,
      issuedAt: new Date('2026-06-29T10:00:00.000Z'),
      lastUsedAt: new Date('2026-06-29T11:55:00.000Z'),
      expiresAt: new Date('2026-06-29T22:00:00.000Z'),
    })
    .returning();

  if (session === undefined) throw new Error('Expected session insert.');
  return session;
};

describe('session administration repository', () => {
  it('lists session metadata without returning token hashes', async () => {
    const identityId = await insertIdentity('target@pressly.test');
    const session = await insertSession(identityId, 'secret-token-hash');
    const store = makeListIdentitySessionsStore(testDb.db);

    const value = await store.listIdentitySessions(identityId);

    expect(value).toEqual([
      {
        id: session.id,
        issuedAt: session.issuedAt,
        lastUsedAt: session.lastUsedAt,
        expiresAt: session.expiresAt,
        revokedAt: null,
      },
    ]);
    expect(JSON.stringify(value)).not.toContain('secret-token-hash');
  });

  it('selectively revokes one session and records the principal audit event', async () => {
    const principalIdentityId = await insertIdentity('owner@pressly.test');
    const identityId = await insertIdentity('target@pressly.test');
    const selected = await insertSession(identityId, 'selected-token');
    const untouched = await insertSession(identityId, 'untouched-token');
    const store = makeRevokeIdentitySessionsStore(testDb.db);

    const count = await store.revokeIdentitySessions({
      principalIdentityId,
      identityId,
      sessionId: selected.id,
      revokedAt: now,
    });

    expect(count).toBe(1);
    const sessions = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.identityId, identityId));
    expect(
      sessions.find((session) => session.id === selected.id)?.revokedAt,
    ).toEqual(now);
    expect(
      sessions.find((session) => session.id === untouched.id)?.revokedAt,
    ).toBeNull();

    const [audit] = await testDb.db
      .select()
      .from(auth.authAuditEvents)
      .where(eq(auth.authAuditEvents.eventType, 'auth.session.revoked'));
    expect(audit).toMatchObject({
      principalIdentityId,
      resourceId: identityId,
      metadata: { revokedCount: 1, sessionId: selected.id },
    });
  });

  it('revokes every active session for an identity idempotently', async () => {
    const principalIdentityId = await insertIdentity('owner@pressly.test');
    const identityId = await insertIdentity('target@pressly.test');
    await insertSession(identityId, 'first-token');
    await insertSession(identityId, 'second-token');
    const store = makeRevokeIdentitySessionsStore(testDb.db);

    const command = { principalIdentityId, identityId, revokedAt: now };
    expect(await store.revokeIdentitySessions(command)).toBe(2);
    expect(await store.revokeIdentitySessions(command)).toBe(0);
  });
});
