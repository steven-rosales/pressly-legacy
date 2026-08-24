import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerRevokeIdentitySessionCellDeclaration,
  makeCustomerRevokeIdentitySessionCell,
} from './cell.ts';
import { customerRevokeIdentitySessionContract } from './contract.ts';

proveOperation({
  operationId: 'customer.revoke-identity-session.v1',
  declaration: customerRevokeIdentitySessionCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves the exact selected session in the Access revocation input',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          principalIdentityId: '10000000-0000-4000-8000-000000000001',
          identityId: '10000000-0000-4000-8000-000000000002',
          sessionId: '20000000-0000-4000-8000-000000000001',
          requestId: 'request-1',
        };
        expect(
          customerRevokeIdentitySessionContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerRevokeIdentitySessionCellDeclaration.id).toBe(
          'customer.revoke-identity-session.v1',
        );
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { revokedCount: 1 },
        });

        await expect(
          makeCustomerRevokeIdentitySessionCell({ execute } as never).execute(
            input,
          ),
        ).resolves.toEqual({ kind: 'success', value: { revokedCount: 1 } });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
