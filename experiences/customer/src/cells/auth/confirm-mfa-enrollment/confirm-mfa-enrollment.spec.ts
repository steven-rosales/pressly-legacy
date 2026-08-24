import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerConfirmMfaEnrollmentCellDeclaration,
  makeCustomerConfirmMfaEnrollmentCell,
} from './cell.ts';
import { customerConfirmMfaEnrollmentContract } from './contract.ts';

proveOperation({
  operationId: 'customer.confirm-mfa-enrollment.v1',
  declaration: customerConfirmMfaEnrollmentCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'maps the session-bound confirmation and copies recovery codes',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          sessionId: '20000000-0000-4000-8000-000000000001',
          code: '123456',
          requestId: 'request-1',
        };
        expect(
          customerConfirmMfaEnrollmentContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerConfirmMfaEnrollmentCellDeclaration.id).toBe(
          'customer.confirm-mfa-enrollment.v1',
        );
        const recoveryCodes = ['recovery-code-1'];
        const execute = vi.fn().mockResolvedValue({
          kind: 'success',
          value: { recoveryCodes },
        });

        const outcome = await makeCustomerConfirmMfaEnrollmentCell({
          execute,
        } as never).execute(input);
        expect(outcome).toEqual({ kind: 'success', value: { recoveryCodes } });
        if (outcome.kind === 'success')
          expect(outcome.value.recoveryCodes).not.toBe(recoveryCodes);
      },
    },
  ],
});

proveOperation({
  operationId: 'customer.confirm-mfa-enrollment.v1',
  declaration: customerConfirmMfaEnrollmentCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves invalid_mfa_code without copying recovery material',
      proves: ['contract', 'executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          sessionId: '20000000-0000-4000-8000-000000000001',
          code: '123456',
        };
        const failure = {
          kind: 'authentication' as const,
          code: 'invalid_mfa_code' as const,
          message: 'The MFA code is invalid.',
        };
        expect(
          customerConfirmMfaEnrollmentContract.failure.decode(failure),
        ).toEqual({ kind: 'valid', value: failure });
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(
          makeCustomerConfirmMfaEnrollmentCell({ execute } as never).execute(
            input,
          ),
        ).resolves.toEqual({ kind: 'failure', failure });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
    {
      name: 'preserves mfa_enrollment_missing without copying recovery material',
      proves: ['executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          sessionId: '20000000-0000-4000-8000-000000000001',
          code: '123456',
        };
        const failure = {
          kind: 'conflict' as const,
          code: 'mfa_enrollment_missing' as const,
          message: 'Start MFA enrollment before confirming it.',
        };
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(
          makeCustomerConfirmMfaEnrollmentCell({ execute } as never).execute(
            input,
          ),
        ).resolves.toEqual({ kind: 'failure', failure });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
