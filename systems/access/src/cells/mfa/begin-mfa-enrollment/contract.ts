import { z } from 'zod';
import type { BeginMfaEnrollment } from './begin-mfa-enrollment.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';

export const beginMfaEnrollmentContract = defineAccessCellContract<
  OperationInput<BeginMfaEnrollment>,
  OperationOutput<BeginMfaEnrollment>,
  OperationFailure<BeginMfaEnrollment>
>({
  label: 'access.begin-mfa-enrollment.v1',
  input: exactOptionalContractSchema<OperationInput<BeginMfaEnrollment>>(
    z
      .object({
        identityId: z.string(),
        label: z.string(),
        requestId: z.string().optional(),
      })
      .strict(),
  ),
  output: z.object({ secret: z.string(), enrollmentUri: z.string() }).strict(),
  failure: z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('mfa_already_enabled'),
      message: z.string(),
    })
    .strict(),
});
