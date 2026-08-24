import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerLogoutCellDeclaration,
  makeCustomerLogoutCell,
} from './cell.ts';
import { customerLogoutContract } from './contract.ts';

proveOperation({
  operationId: 'customer.logout.v1',
  declaration: customerLogoutCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'maps the bearer proof and request identity to Access revocation',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = { bearerToken: 'bearer-token', requestId: 'request-1' };
        expect(customerLogoutContract.input.decode(input).kind).toBe('valid');
        expect(customerLogoutCellDeclaration).toMatchObject({
          id: 'customer.logout.v1',
          kind: 'command',
          surfaces: [{ kind: 'http', method: 'POST', path: '/auth/logout' }],
        });
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { revoked: true },
        });

        await expect(
          makeCustomerLogoutCell({ execute } as never).execute(input),
        ).resolves.toEqual({ kind: 'success', value: { revoked: true } });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
