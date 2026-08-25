import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it, vi } from 'vitest';
import { completeMfaChallengeCellDeclaration } from './cell.ts';
import { makeCompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';
import type {
  CompleteMfaChallengeStore,
  MfaChallengeRecord,
} from './complete-mfa-challenge.port.ts';

const now = new Date('2026-06-29T12:00:00.000Z');
const identityId = '11111111-1111-4111-8111-111111111111';
const challengeId = '22222222-2222-4222-8222-222222222222';

const challenge: MfaChallengeRecord = {
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
};

const makeStore = (
  input: {
    found?: MfaChallengeRecord;
    reservation?: 'exhausted' | 'expired' | 'invalid';
    completion?: 'completed' | 'rejected';
  } = {},
) => {
  const reserveChallengeAttempt = vi.fn(async () =>
    input.reservation === undefined
      ? ({
          status: 'reserved' as const,
          challenge: input.found ?? challenge,
        } as const)
      : ({ status: input.reservation } as const),
  );
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
  const rejectReservedChallengeAttempt = vi.fn(async () => undefined);

  const store = {
    reserveChallengeAttempt,
    rejectReservedChallengeAttempt,
    completeTotpChallenge,
    completeRecoveryChallenge,
  } satisfies CompleteMfaChallengeStore;
  return {
    store,
    reserveChallengeAttempt,
    rejectReservedChallengeAttempt,
    completeTotpChallenge,
    completeRecoveryChallenge,
  };
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
    maxAttempts: 8,
  });

describe('complete MFA challenge', () => {
  proveOperation({
    operationId: 'access.complete-mfa-challenge.v1',
    declaration: completeMfaChallengeCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'creates an MFA session after a valid one-time code',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = {
            challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
            method: 'totp' as const,
            code: '123456',
          };
          expect(
            completeMfaChallengeCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const { store, reserveChallengeAttempt, completeTotpChallenge } =
            makeStore();
          const complete = makeSubject(store);

          const actual = await complete(input);

          expect(actual).toMatchObject({
            tag: 'ok',
            value: {
              accessToken: 'access-token-with-at-least-thirty-two-characters',
              principal: { identityId, roles: ['owner'] },
            },
          });
          expect(reserveChallengeAttempt).toHaveBeenCalledWith({
            tokenHash: 'hash:challenge-token-with-at-least-thirty-two-chars',
            now,
            maxAttempts: 8,
          });
          expect(completeTotpChallenge).toHaveBeenCalledWith(
            expect.objectContaining({ challengeId, identityId, counter: 42 }),
          );
        },
      },
    ],
  });

  it('projects the Customer audience after completing MFA', async () => {
    const customerId = '30000000-0000-4000-8000-000000000001';
    const { store } = makeStore({
      found: { ...challenge, audience: 'customer', customerId },
    });
    const actual = await makeSubject(store)({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'totp',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'ok',
      value: { principal: { audience: 'customer', customerId } },
    });
  });

  it('rejects an invalid_mfa_challenge before completing either method', async () => {
    const { store, completeTotpChallenge, completeRecoveryChallenge } =
      makeStore({ reservation: 'invalid' });
    const actual = await makeSubject(store)({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'totp',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: {
        kind: 'authentication',
        code: 'invalid_mfa_challenge',
      },
    });
    expect(completeTotpChallenge).not.toHaveBeenCalled();
    expect(completeRecoveryChallenge).not.toHaveBeenCalled();
  });

  it('fails closed when the durable reservation reports expiration', async () => {
    const { store, completeTotpChallenge } = makeStore({
      reservation: 'expired',
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

  it('fails closed before code verification when the durable attempt ceiling is exhausted', async () => {
    const { store, completeTotpChallenge, completeRecoveryChallenge } =
      makeStore({ reservation: 'exhausted' });
    const actual = await makeSubject(store)({
      challengeToken: 'challenge-token-with-at-least-thirty-two-chars',
      method: 'totp',
      code: '123456',
    });

    expect(actual).toMatchObject({
      tag: 'err',
      error: { code: 'invalid_mfa_challenge' },
    });
    expect(completeTotpChallenge).not.toHaveBeenCalled();
    expect(completeRecoveryChallenge).not.toHaveBeenCalled();
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
    expect(totpStore.rejectReservedChallengeAttempt).toHaveBeenCalledWith({
      challengeId,
      identityId,
      now,
      maxAttempts: 8,
    });
    expect(recoveryStore.rejectReservedChallengeAttempt).toHaveBeenCalledWith({
      challengeId,
      identityId,
      now,
      maxAttempts: 8,
    });
  });
});
