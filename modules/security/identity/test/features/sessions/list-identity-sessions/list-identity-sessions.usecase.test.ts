import { describe, expect, it } from 'vitest';
import { makeListIdentitySessions } from '../../../../src/features/sessions/list-identity-sessions/list-identity-sessions.usecase.ts';
import type { ListIdentitySessionsStore } from '../../../../src/features/sessions/list-identity-sessions/list-identity-sessions.port.ts';

const identityId = '11111111-1111-4111-8111-111111111111';
const sessionId = '33333333-3333-4333-8333-333333333333';

describe('list identity sessions', () => {
  it('preserves stored session dates in the application result', async () => {
    const calls: unknown[] = [];
    const store: ListIdentitySessionsStore = {
      async listIdentitySessions(requestedIdentityId) {
        calls.push({ operation: 'list', identityId: requestedIdentityId });
        return [
          {
            id: sessionId,
            issuedAt: new Date('2026-06-29T10:00:00.000Z'),
            lastUsedAt: new Date('2026-06-29T11:55:00.000Z'),
            expiresAt: new Date('2026-06-29T22:00:00.000Z'),
            revokedAt: null,
          },
        ];
      },
    };
    const listSessions = makeListIdentitySessions(store);

    await expect(listSessions(identityId)).resolves.toEqual({
      sessions: [
        {
          id: sessionId,
          issuedAt: new Date('2026-06-29T10:00:00.000Z'),
          lastUsedAt: new Date('2026-06-29T11:55:00.000Z'),
          expiresAt: new Date('2026-06-29T22:00:00.000Z'),
          revokedAt: null,
        },
      ],
    });
    expect(calls).toEqual([{ operation: 'list', identityId }]);
  });
});
