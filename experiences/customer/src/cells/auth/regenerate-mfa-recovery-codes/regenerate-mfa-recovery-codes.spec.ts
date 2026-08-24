import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerRegenerateMfaRecoveryCodesCellDeclaration,
  makeCustomerRegenerateMfaRecoveryCodesCell,
} from './cell.ts';
import { customerRegenerateMfaRecoveryCodesContract } from './contract.ts';

proveOperation({
  operationId: 'customer.regenerate-mfa-recovery-codes.v1',
  declaration: customerRegenerateMfaRecoveryCodesCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'owns MFA-management authorization and returns a copied code inventory',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          requestId: 'request-1',
        };
        expect(
          customerRegenerateMfaRecoveryCodesContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerRegenerateMfaRecoveryCodesCellDeclaration).toMatchObject(
          {
            id: 'customer.regenerate-mfa-recovery-codes.v1',
            authorization: {
              capability: 'auth:mfa:manage',
              timing: 'after-input',
            },
          },
        );
        const recoveryCodes = ['recovery-code-1'];
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { recoveryCodes },
        });

        const outcome = await makeCustomerRegenerateMfaRecoveryCodesCell({
          execute,
        } as never).execute(input);
        expect(outcome).toEqual({ kind: 'success', value: { recoveryCodes } });
        if (outcome.kind === 'success')
          expect(outcome.value.recoveryCodes).not.toBe(recoveryCodes);
      },
    },
  ],
});
