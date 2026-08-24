import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect } from 'vitest';
import { listIdentitySessionsCellDeclaration } from './cell.ts';
import { makeListIdentitySessions } from './list-identity-sessions.usecase.ts';
import type { ListIdentitySessionsStore } from './list-identity-sessions.port.ts';

const identityId = '11111111-1111-4111-8111-111111111111';
const sessionId = '33333333-3333-4333-8333-333333333333';

proveOperation({
  operationId: 'access.list-identity-sessions.v1',
  declaration: listIdentitySessionsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves stored session dates in the result',
      proves: ['contract', 'executor-success'],
      run: async () => {
        expect(
          listIdentitySessionsCellDeclaration.contract.input.decode(identityId)
            .kind,
        ).toBe('valid');
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
      },
    },
  ],
});
