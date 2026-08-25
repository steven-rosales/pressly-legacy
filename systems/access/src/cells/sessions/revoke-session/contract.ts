import { z } from 'zod';
import type { RevokeSession } from './revoke-session.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';

export const revokeSessionContract = defineAccessCellContract<
  OperationInput<RevokeSession>,
  OperationOutput<RevokeSession>,
  OperationFailure<RevokeSession>
>({
  label: 'access.revoke-session.v1',
  input: exactOptionalContractSchema<OperationInput<RevokeSession>>(
    z
      .object({ bearerToken: z.string(), requestId: z.string().optional() })
      .strict(),
  ),
  output: z.object({ revoked: z.literal(true) }).strict(),
  failure: noExpectedFailureSchema,
});
