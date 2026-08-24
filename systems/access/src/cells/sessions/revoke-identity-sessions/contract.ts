import { z } from 'zod';
import type { RevokeIdentitySessions } from './revoke-identity-sessions.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';

export const revokeIdentitySessionsContract = defineAccessCellContract<
  OperationInput<RevokeIdentitySessions>,
  OperationOutput<RevokeIdentitySessions>,
  OperationFailure<RevokeIdentitySessions>
>({
  label: 'access.revoke-identity-sessions.v1',
  input: exactOptionalContractSchema<OperationInput<RevokeIdentitySessions>>(
    z
      .object({
        principalIdentityId: z.string(),
        identityId: z.string(),
        sessionId: z.string().optional(),
        requestId: z.string().optional(),
      })
      .strict(),
  ),
  output: z.object({ revokedCount: z.number() }).strict(),
  failure: noExpectedFailureSchema,
});
