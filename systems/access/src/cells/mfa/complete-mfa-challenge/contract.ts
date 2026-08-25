import { z } from 'zod';
import type { CompleteMfaChallenge } from './complete-mfa-challenge.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { authenticatedSessionSchema } from '../../../model/boundary/schemas.ts';

export const completeMfaChallengeContract = defineAccessCellContract<
  OperationInput<CompleteMfaChallenge>,
  OperationOutput<CompleteMfaChallenge>,
  OperationFailure<CompleteMfaChallenge>
>({
  label: 'access.complete-mfa-challenge.v1',
  input: exactOptionalContractSchema<OperationInput<CompleteMfaChallenge>>(
    z.discriminatedUnion('method', [
      z
        .object({
          challengeToken: z.string(),
          method: z.literal('totp'),
          code: z.string(),
          requestId: z.string().optional(),
        })
        .strict(),
      z
        .object({
          challengeToken: z.string(),
          method: z.literal('recovery'),
          code: z.string(),
          requestId: z.string().optional(),
        })
        .strict(),
    ]),
  ),
  output: exactOptionalContractSchema<OperationOutput<CompleteMfaChallenge>>(
    authenticatedSessionSchema,
  ),
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
