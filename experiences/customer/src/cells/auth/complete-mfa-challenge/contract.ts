import { defineCustomerAuthContract } from '../../../auth/model/boundary-contract.ts';
import { z } from 'zod';
import {
  authenticatedSessionSchema,
  completeMfaInputSchema,
} from '../../../auth/model/schemas.ts';

export const customerCompleteMfaChallengeContract = defineCustomerAuthContract({
  label: 'customer.complete-mfa-challenge.v1',
  input: completeMfaInputSchema,
  output: authenticatedSessionSchema,
  failure: z
    .object({
      kind: z.literal('authentication'),
      code: z.enum([
        'invalid_mfa_challenge',
        'expired_mfa_challenge',
        'invalid_mfa_code',
      ]),
      message: z.string(),
    })
    .strict(),
});
