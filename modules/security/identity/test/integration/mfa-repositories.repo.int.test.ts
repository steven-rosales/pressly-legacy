import { eq } from '@pressly/db/query';
import * as auth from '@pressly/db/schema/auth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeBeginMfaEnrollmentStore } from '../../src/features/mfa/begin-mfa-enrollment/begin-mfa-enrollment.repo.ts';
import { makeCompleteMfaChallengeStore } from '../../src/features/mfa/complete-mfa-challenge/complete-mfa-challenge.repo.ts';
import { makeConfirmMfaEnrollmentStore } from '../../src/features/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.repo.ts';
import { makeRegenerateMfaRecoveryCodesStore } from '../../src/features/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.repo.ts';
import { makeRemoveMfaStore } from '../../src/features/mfa/remove-mfa/remove-mfa.repo.ts';
import { createAuthTestDatabase } from '../support/database.ts';

const testDb = createAuthTestDatabase();
const now = new Date('2026-06-29T12:00:00.000Z');

beforeAll(testDb.check);
beforeEach(testDb.reset);
afterAll(testDb.close);

const insertOwner = async () => {
  const [identity] = await testDb.db
    .insert(auth.authIdentities)
    .values({
      kind: 'human',
      displayName: 'Owner',
      email: 'owner@pressly.test',
      emailNormalized: 'owner@pressly.test',
    })
    .returning();
  if (identity === undefined) throw new Error('Expected owner identity.');

  await testDb.db.insert(auth.authRoleAssignments).values({
    identityId: identity.id,
    role: 'owner',
    scopeKind: 'global',
  });
  return identity;
};

const insertEnabledMfa = async (identityId: string) => {
  await testDb.db.insert(auth.authMfaCredentials).values({
    identityId,
    encryptedSecret: 'encrypted-secret',
    status: 'enabled',
    enabledAt: now,
  });
};

const insertChallenge = async (identityId: string, tokenHash: string) => {
  const [challenge] = await testDb.db
    .insert(auth.authMfaChallenges)
    .values({
      identityId,
      tokenHash,
      expiresAt: new Date('2026-06-29T12:05:00.000Z'),
    })
    .returning();
  if (challenge === undefined) throw new Error('Expected MFA challenge.');
  return challenge;
};

describe('MFA repository', () => {
  it('consumes a TOTP challenge once and advances its replay counter atomically', async () => {
    const identity = await insertOwner();
    await insertEnabledMfa(identity.id);
    const challenge = await insertChallenge(identity.id, 'challenge-hash');
    const store = makeCompleteMfaChallengeStore(testDb.db);

    const command = {
      challengeId: challenge.id,
      identityId: identity.id,
      counter: 100,
      sessionTokenHash: 'mfa-session-hash',
      issuedAt: now,
      expiresAt: new Date('2026-06-29T20:00:00.000Z'),
    };
    expect(await store.completeTotpChallenge(command)).toMatchObject({
      status: 'completed',
    });
    expect(await store.completeTotpChallenge(command)).toEqual({
      status: 'rejected',
    });

    const [credential] = await testDb.db
      .select()
      .from(auth.authMfaCredentials)
      .where(eq(auth.authMfaCredentials.identityId, identity.id));
    const [session] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.tokenHash, 'mfa-session-hash'));
    expect(credential?.lastUsedCounter).toBe(100);
    expect(session?.assuranceLevel).toBe('mfa');
  });

  it('uses one recovery code, revokes sessions, and resets MFA', async () => {
    const identity = await insertOwner();
    await insertEnabledMfa(identity.id);
    const challenge = await insertChallenge(identity.id, 'recovery-challenge');
    await testDb.db.insert(auth.authMfaRecoveryCodes).values({
      identityId: identity.id,
      codeHash: 'recovery-hash',
    });
    const [oldSession] = await testDb.db
      .insert(auth.authSessions)
      .values({
        identityId: identity.id,
        tokenHash: 'old-session',
        assuranceLevel: 'mfa',
        issuedAt: new Date('2026-06-29T10:00:00.000Z'),
        lastUsedAt: new Date('2026-06-29T11:00:00.000Z'),
        expiresAt: new Date('2026-06-29T20:00:00.000Z'),
      })
      .returning();
    const store = makeCompleteMfaChallengeStore(testDb.db);

    expect(
      await store.completeRecoveryChallenge({
        challengeId: challenge.id,
        identityId: identity.id,
        recoveryCodeHash: 'recovery-hash',
        sessionTokenHash: 'recovery-session',
        issuedAt: now,
        expiresAt: new Date('2026-06-29T20:00:00.000Z'),
      }),
    ).toMatchObject({ status: 'completed' });

    const credentials = await testDb.db
      .select()
      .from(auth.authMfaCredentials)
      .where(eq(auth.authMfaCredentials.identityId, identity.id));
    const sessions = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.identityId, identity.id));
    expect(credentials).toHaveLength(0);
    expect(
      sessions.find((session) => session.id === oldSession?.id)?.revokedAt,
    ).toEqual(now);
    expect(
      sessions.find((session) => session.tokenHash === 'recovery-session')
        ?.assuranceLevel,
    ).toBe('password');
  });

  it('enrolls, rotates recovery codes, and removes MFA', async () => {
    const identity = await insertOwner();
    const [session] = await testDb.db
      .insert(auth.authSessions)
      .values({
        identityId: identity.id,
        tokenHash: 'password-session',
        assuranceLevel: 'password',
        issuedAt: now,
        lastUsedAt: now,
        expiresAt: new Date('2026-06-29T20:00:00.000Z'),
      })
      .returning();
    if (session === undefined) throw new Error('Expected session.');
    const beginStore = makeBeginMfaEnrollmentStore(testDb.db);
    const confirmStore = makeConfirmMfaEnrollmentStore(testDb.db);
    const regenerateStore = makeRegenerateMfaRecoveryCodesStore(testDb.db);
    const removeStore = makeRemoveMfaStore(testDb.db);

    expect(
      await beginStore.beginEnrollment({
        identityId: identity.id,
        encryptedSecret: 'encrypted-secret',
        now,
      }),
    ).toBe('pending');
    expect(
      await confirmStore.confirmEnrollment({
        identityId: identity.id,
        sessionId: session.id,
        counter: 200,
        recoveryCodeHashes: ['code-1', 'code-2'],
        now,
      }),
    ).toBe(true);
    await regenerateStore.replaceRecoveryCodes({
      identityId: identity.id,
      recoveryCodeHashes: ['code-3'],
      now,
    });

    const [upgraded] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, session.id));
    expect(upgraded?.assuranceLevel).toBe('mfa');

    await removeStore.removeMfa({
      identityId: identity.id,
      sessionId: session.id,
      now,
    });
    const credentials = await testDb.db
      .select()
      .from(auth.authMfaCredentials)
      .where(eq(auth.authMfaCredentials.identityId, identity.id));
    const [downgraded] = await testDb.db
      .select()
      .from(auth.authSessions)
      .where(eq(auth.authSessions.id, session.id));
    expect(credentials).toHaveLength(0);
    expect(downgraded?.assuranceLevel).toBe('password');
  });
});
