import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerListIdentitySessionsCellDeclaration,
  makeCustomerListIdentitySessionsCell,
} from './cell.ts';
import { customerListIdentitySessionsContract } from './contract.ts';

proveOperation({
  operationId: 'customer.list-identity-sessions.v1',
  declaration: customerListIdentitySessionsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'keeps identity authorization before input and copies the Access inventory',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const identityId = '10000000-0000-4000-8000-000000000001';
        const input = { identityId };
        expect(
          customerListIdentitySessionsContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerListIdentitySessionsCellDeclaration).toMatchObject({
          id: 'customer.list-identity-sessions.v1',
          kind: 'query',
          authorization: {
            capability: 'auth:session:read',
            timing: 'before-input',
          },
        });
        const session = {
          id: '20000000-0000-4000-8000-000000000001',
          issuedAt: new Date('2026-08-23T12:00:00.000Z'),
          lastUsedAt: new Date('2026-08-23T13:00:00.000Z'),
          expiresAt: new Date('2026-08-24T12:00:00.000Z'),
          revokedAt: null,
        };
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { sessions: [session] },
        });

        await expect(
          makeCustomerListIdentitySessionsCell({ execute } as never).execute(
            input,
          ),
        ).resolves.toEqual({ kind: 'success', value: { sessions: [session] } });
        expect(execute).toHaveBeenCalledWith(identityId);
      },
    },
  ],
});
