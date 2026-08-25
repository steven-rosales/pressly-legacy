import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import { z } from 'zod';
import {
  confirmMfaInputSchema,
  recoveryCodesSchema,
} from '../../../auth/model/schemas.ts';

export const customerConfirmMfaEnrollmentContract = defineCustomerAuthContract({
  label: 'customer.confirm-mfa-enrollment.v1',
  input: confirmMfaInputSchema,
  output: recoveryCodesSchema,
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
