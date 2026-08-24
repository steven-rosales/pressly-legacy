import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import { z } from 'zod';
import {
  beginMfaInputSchema,
  enrollmentSchema,
} from '../../../auth/model/schemas.ts';

export const customerBeginMfaEnrollmentContract = defineCustomerAuthContract({
  label: 'customer.begin-mfa-enrollment.v1',
  input: beginMfaInputSchema,
  output: enrollmentSchema,
  failure: z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('mfa_already_enabled'),
      message: z.string(),
    })
    .strict(),
});
