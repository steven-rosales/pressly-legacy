import { result } from '@pressly/kernel';
import { describe, expect, it } from 'vitest';
import type { AdministerSessionsStore } from '../../src/features/administer-sessions/administer-sessions.port.ts';
import { makeListIdentitySessions } from '../../src/features/administer-sessions/list-identity-sessions.usecase.ts';
import { makeRevokeIdentitySessions } from '../../src/features/administer-sessions/revoke-identity-sessions.usecase.ts';

const identityId = '11111111-1111-4111-8111-111111111111';
const principalIdentityId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-06-29T12:00:00.000Z');

const makeStore = () => {
  const calls: unknown[] = [];
  const store: AdministerSessionsStore = {
    async listIdentitySessions(requestedIdentityId) {
      calls.push({ operation: 'list', identityId: requestedIdentityId });
      return result.ok([
        {
          id: sessionId,
          issuedAt: new Date('2026-06-29T10:00:00.000Z'),
          lastUsedAt: new Date('2026-06-29T11:55:00.000Z'),
          expiresAt: new Date('2026-06-29T22:00:00.000Z'),
          revokedAt: null,
        },
      ]);
    },
    async revokeIdentitySessions(input) {
      calls.push({ operation: 'revoke', ...input });
      return result.ok(1);
    },
  };

  return { store, calls };
};

describe('session administration use cases', () => {
  it('maps stored session dates to boundary UTC timestamps', async () => {
    const { store, calls } = makeStore();
    const listSessions = makeListIdentitySessions(store);

    await expect(listSessions(identityId)).resolves.toEqual({
      tag: 'ok',
      value: {
        sessions: [
          {
            id: sessionId,
            issuedAt: '2026-06-29T10:00:00.000Z',
            lastUsedAt: '2026-06-29T11:55:00.000Z',
            expiresAt: '2026-06-29T22:00:00.000Z',
            revokedAt: null,
          },
        ],
      },
    });
    expect(calls).toEqual([{ operation: 'list', identityId }]);
  });

  it('revokes one selected session with the authenticated principal', async () => {
    const { store, calls } = makeStore();
    const revokeSessions = makeRevokeIdentitySessions({
      store,
      clock: { now: () => now },
    });

    await expect(
      revokeSessions({ principalIdentityId, identityId, sessionId }),
    ).resolves.toEqual({ tag: 'ok', value: { revokedCount: 1 } });
    expect(calls).toEqual([
      {
        operation: 'revoke',
        principalIdentityId,
        identityId,
        sessionId,
        revokedAt: now,
      },
    ]);
  });

  it('omits a session ID when revoking every active session', async () => {
    const { store, calls } = makeStore();
    const revokeSessions = makeRevokeIdentitySessions({
      store,
      clock: { now: () => now },
    });

    await revokeSessions({ principalIdentityId, identityId });

    expect(calls).toEqual([
      {
        operation: 'revoke',
        principalIdentityId,
        identityId,
        revokedAt: now,
      },
    ]);
  });
});
