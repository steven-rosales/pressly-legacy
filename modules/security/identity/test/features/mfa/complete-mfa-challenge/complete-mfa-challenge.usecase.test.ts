import { describe, expect, it, vi } from 'vitest';
import { makeCompleteMfaChallenge } from '../../../../src/features/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.ts';
import type { CompleteMfaChallengeStore } from '../../../../src/features/mfa/complete-mfa-challenge/complete-mfa-challenge.port.ts';

const now = new Date('2026-06-29T12:00:00.000Z');
const identityId = '11111111-1111-4111-8111-111111111111';
const challengeId = '22222222-2222-4222-8222-222222222222';

const challenge = {
  challengeId,
  identityId,
  kind: 'human' as const,
  displayName: 'Owner',
  email: 'owner@pressly.test',
  isActive: true,
  roles: ['owner' as const],
  encryptedSecret: 'encrypted-secret',
  lastUsedCounter: null,
  expiresAt: new Date('2026-06-29T12:05:00.000Z'),
  consumedAt: null,
};

const makeStore = (
  input: {
    found?: typeof challenge;
    completion?: 'completed' | 'rejected';
  } = {},
) => {
  const completeTotpChallenge = vi.fn(async () =>
    input.completion === 'rejected'
      ? ({ status: 'rejected' } as const)
      : ({
          status: 'completed',
          issuedAt: now,
          expiresAt: new Date('2026-06-29T12:30:00.000Z'),
        } as const),
  );
  const completeRecoveryChallenge = vi.fn(
    async () => ({ status: 'rejected' }) as const,
  );

  const store = {
    findChallengeByTokenHash: async () =>
      'found' in input ? input.found : challenge,
    completeTotpChallenge,
    completeRecoveryChallenge,
  } satisfies CompleteMfaChallengeStore;
  return { store, completeTotpChallenge, completeRecoveryChallenge };
};

const makeSubject = (store: CompleteMfaChallengeStore) =>
  makeCompleteMfaChallenge({
    store,
    tokenService: {
      issue: () => 'access-token-with-at-least-thirty-two-characters',
      hash: (value) => `hash:${value}`,
    },
    totp: {
      generateSecret: vi.fn(),
      enrollmentUri: vi.fn(),
      verify: () => ({ valid: true, counter: 42 }),
    },
    secretBox: {
      encrypt: vi.fn(),
      decrypt: () => 'BASE32SECRET',
    },
    recoveryCodes: {
      generate: vi.fn(),
      hash: (value) => `recovery:${value}`,
    },
    clock: { now: () => now },
    sessionTtlMinutes: 30,
  });

describe('complete MFA challenge', () => {
  it('creates an MFA session after a valid one-time code', async () => {
    const { store, completeTotpChallenge } = makeStore();
    const complete = makeSubject(store);

    const actual = await complete({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'totp',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'ok',
      value: {
        accessToken: 'access-token-with-at-least-thirty-two-characters',
        principal: { identityId, roles: ['owner'] },
      },
    });
    expect(completeTotpChallenge).toHaveBeenCalledWith(
      expect.objectContaining({ challengeId, identityId, counter: 42 }),
    );
  });

  it('fails closed when the challenge has expired', async () => {
    const { store, completeTotpChallenge } = makeStore({
      found: { ...challenge, expiresAt: now },
    });
    const actual = await makeSubject(store)({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'totp',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { code: 'expired_mfa_challenge' },
    });
    expect(completeTotpChallenge).not.toHaveBeenCalled();
  });

  it('rejects replayed TOTP counters and used recovery codes', async () => {
    const totpStore = makeStore({ completion: 'rejected' });
    const totp = await makeSubject(totpStore.store)({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'totp',
      code: '123456',
    });
    const recoveryStore = makeStore();
    const recovery = await makeSubject(recoveryStore.store)({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'recovery',
      code: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF',
    });

    expect(totp).toMatchObject({
      tag: 'err',
      error: { code: 'invalid_mfa_code' },
    });
    expect(recovery).toMatchObject({
      tag: 'err',
      error: { code: 'invalid_mfa_code' },
    });
    expect(recoveryStore.completeRecoveryChallenge).toHaveBeenCalledWith(
      expect.objectContaining({
        recoveryCodeHash: 'recovery:AAAA-BBBB-CCCC-DDDD-EEEE-FFFF',
      }),
    );
  });
});
