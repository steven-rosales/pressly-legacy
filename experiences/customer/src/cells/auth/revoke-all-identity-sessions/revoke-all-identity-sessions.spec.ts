import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerRevokeAllIdentitySessionsCellDeclaration,
  makeCustomerRevokeAllIdentitySessionsCell,
} from './cell.ts';
import { customerRevokeAllIdentitySessionsContract } from './contract.ts';

proveOperation({
  operationId: 'customer.revoke-all-identity-sessions.v1',
  declaration: customerRevokeAllIdentitySessionsCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'maps principal and target identities without inventing a session filter',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          principalIdentityId: '10000000-0000-4000-8000-000000000001',
          identityId: '10000000-0000-4000-8000-000000000002',
          requestId: 'request-1',
        };
        expect(
          customerRevokeAllIdentitySessionsContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerRevokeAllIdentitySessionsCellDeclaration).toMatchObject({
          id: 'customer.revoke-all-identity-sessions.v1',
          authorization: {
            capability: 'auth:session:revoke',
            timing: 'before-input',
          },
        });
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { revokedCount: 2 },
        });

        await expect(
          makeCustomerRevokeAllIdentitySessionsCell({
            execute,
          } as never).execute(input),
        ).resolves.toEqual({ kind: 'success', value: { revokedCount: 2 } });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
