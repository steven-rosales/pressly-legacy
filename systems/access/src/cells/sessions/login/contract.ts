import { z } from 'zod';
import type { Login } from './login.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import {
  authenticatedPrincipalSchema,
  authenticatedSessionSchema,
  utcDateSchema,
} from '../../../model/boundary/schemas.ts';

export const loginContract = defineAccessCellContract<
  OperationInput<Login>,
  OperationOutput<Login>,
  OperationFailure<Login>
>({
  label: 'access.login.v1',
  input: exactOptionalContractSchema<OperationInput<Login>>(
    z
      .object({
        email: z.string(),
        password: z.string(),
        ipAddress: z.string().optional(),
        userAgent: z.string().optional(),
        requestId: z.string().optional(),
      })
      .strict(),
  ),
  output: exactOptionalContractSchema<OperationOutput<Login>>(
    z.union([
      authenticatedSessionSchema,
      z
        .object({
          status: z.literal('mfa_required'),
          challengeToken: z.string(),
          expiresAt: utcDateSchema,
          principal: authenticatedPrincipalSchema,
        })
        .strict(),
    ]),
  ),
  failure: z
    .object({
      kind: z.enum(['authentication', 'rate_limit']),
      code: z.enum(['invalid_credentials', 'login_rate_limited']),
      message: z.string(),
    })
    .strict(),
});
