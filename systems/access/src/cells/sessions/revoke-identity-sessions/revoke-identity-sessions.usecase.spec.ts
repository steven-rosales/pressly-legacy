import { proveOperation } from '@pressly/testkit/operation-proof';
import { describe, expect, it } from 'vitest';
import { revokeIdentitySessionsCellDeclaration } from './cell.ts';
import { makeRevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';
import type { RevokeIdentitySessionsStore } from './revoke-identity-sessions.port.ts';

const identityId = '11111111-1111-4111-8111-111111111111';
const principalIdentityId = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const now = new Date('2026-06-29T12:00:00.000Z');

const makeStore = () => {
  const calls: unknown[] = [];
  const store: RevokeIdentitySessionsStore = {
    async revokeIdentitySessions(input) {
      calls.push({ operation: 'revoke', ...input });
      return 1;
    },
  };
  return { store, calls };
};

describe('revoke identity sessions', () => {
  proveOperation({
    operationId: 'access.revoke-identity-sessions.v1',
    declaration: revokeIdentitySessionsCellDeclaration,
    layer: 'unit',
    scenarios: [
      {
        name: 'revokes one selected session with the authenticated principal',
        proves: ['contract', 'executor-success'],
        run: async () => {
          const input = { principalIdentityId, identityId, sessionId };
          expect(
            revokeIdentitySessionsCellDeclaration.contract.input.decode(input)
              .kind,
          ).toBe('valid');
          const { store, calls } = makeStore();
          const revokeSessions = makeRevokeIdentitySessions({
            store,
            clock: { now: () => now },
          });

          await expect(revokeSessions(input)).resolves.toEqual({
            revokedCount: 1,
          });
          expect(calls).toEqual([
            {
              operation: 'revoke',
              ...input,
              revokedAt: now,
            },
          ]);
        },
      },
    ],
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
