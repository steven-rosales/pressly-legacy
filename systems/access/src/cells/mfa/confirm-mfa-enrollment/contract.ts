import { z } from 'zod';
import type { ConfirmMfaEnrollment } from './confirm-mfa-enrollment.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const confirmMfaEnrollmentContract = defineAccessCellContract<
  OperationInput<ConfirmMfaEnrollment>,
  OperationOutput<ConfirmMfaEnrollment>,
  OperationFailure<ConfirmMfaEnrollment>
>({
  label: 'access.confirm-mfa-enrollment.v1',
  input: exactOptionalContractSchema<OperationInput<ConfirmMfaEnrollment>>(
    z
      .object({
        identityId: z.string(),
        sessionId: z.string(),
        code: z.string(),
        requestId: z.string().optional(),
      })
      .strict(),
  ),
  output: z.object({ recoveryCodes: z.array(z.string()) }).strict(),
  failure: z.discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('authentication'),
        code: z.literal('invalid_mfa_code'),
        message: z.string(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('conflict'),
        code: z.literal('mfa_enrollment_missing'),
        message: z.string(),
      })
      .strict(),
  ]),
});
