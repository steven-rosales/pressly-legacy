import { proveOperation } from '@pressly/testkit/operation-proof';
import { expect, vi } from 'vitest';
import {
  customerBeginMfaEnrollmentCellDeclaration,
  makeCustomerBeginMfaEnrollmentCell,
} from './cell.ts';
import { customerBeginMfaEnrollmentContract } from './contract.ts';

proveOperation({
  operationId: 'customer.begin-mfa-enrollment.v1',
  declaration: customerBeginMfaEnrollmentCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'binds the authenticated identity label to the Access enrollment command',
      proves: ['contract', 'protocol', 'executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          label: 'Ada Customer',
          requestId: 'request-1',
        };
        expect(
          customerBeginMfaEnrollmentContract.input.decode(input).kind,
        ).toBe('valid');
        expect(customerBeginMfaEnrollmentCellDeclaration).toMatchObject({
          id: 'customer.begin-mfa-enrollment.v1',
          authorization: {
            capability: 'auth:mfa:enroll',
            timing: 'after-input',
          },
        });
        const value = {
          secret: 's'.repeat(16),
          enrollmentUri: 'otpauth://totp/Pressly:ada',
        };
        const execute = vi.fn().mockResolvedValue({ kind: 'success', value });

        await expect(
          makeCustomerBeginMfaEnrollmentCell({ execute } as never).execute(
            input,
          ),
        ).resolves.toEqual({ kind: 'success', value });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});

proveOperation({
  operationId: 'customer.begin-mfa-enrollment.v1',
  declaration: customerBeginMfaEnrollmentCellDeclaration,
  layer: 'unit',
  scenarios: [
    {
      name: 'preserves mfa_already_enabled as the only reachable enrollment rejection',
      proves: ['contract', 'executor-success'],
      run: async () => {
        const input = {
          identityId: '10000000-0000-4000-8000-000000000001',
          label: 'Ada Customer',
        };
        const failure = {
          kind: 'conflict' as const,
          code: 'mfa_already_enabled' as const,
          message: 'MFA is already enabled.',
        };
        expect(
          customerBeginMfaEnrollmentContract.failure.decode(failure),
        ).toEqual({ kind: 'valid', value: failure });
        const execute = vi.fn().mockResolvedValue({ kind: 'failure', failure });

        await expect(
          makeCustomerBeginMfaEnrollmentCell({ execute } as never).execute(
            input,
          ),
        ).resolves.toEqual({ kind: 'failure', failure });
        expect(execute).toHaveBeenCalledWith(input);
      },
    },
  ],
});
