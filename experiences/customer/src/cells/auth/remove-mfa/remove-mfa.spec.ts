import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerRemoveMfaCellDeclaration,
  makeCustomerRemoveMfaCell,
} from './cell.ts';
import { customerRemoveMfaContract } from './contract.ts';

proveOperation({
  operationId: 'customer.remove-mfa.v1',
  declaration: customerRemoveMfaCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves the active session identity in the Access MFA removal command',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          sessionId: '20000000-0000-4000-8000-000000000001',
          requestId: 'request-1',
        };
        expect(customerRemoveMfaContract.input.decode(input).kind).toBe(
          'valid',
        );
        expect(customerRemoveMfaCellDeclaration).toMatchObject({
          id: 'customer.remove-mfa.v1',
          authorization: {
            capability: 'auth:mfa:manage',
            timing: 'after-input',
          },
        });
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { updated: true },
        });

        await expect(
          makeCustomerRemoveMfaCell({ execute } as never).execute(input),
        ).resolves.toEqual({ kind: 'success', value: { updated: true } });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
