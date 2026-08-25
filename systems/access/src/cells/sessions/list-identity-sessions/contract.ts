import { z } from 'zod';
import type { ListIdentitySessions } from './list-identity-sessions.usecase.ts';
import {
  defineAccessCellContract,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import {
  noExpectedFailureSchema,
  utcDateSchema,
} from '../../../model/boundary/schemas.ts';

export const listIdentitySessionsContract = defineAccessCellContract<
  OperationInput<ListIdentitySessions>,
  OperationOutput<ListIdentitySessions>,
  OperationFailure<ListIdentitySessions>
>({
  label: 'access.list-identity-sessions.v1',
  input: z.string(),
  output: z
    .object({
      sessions: z.array(
        z
          .object({
            id: z.string(),
            issuedAt: utcDateSchema,
            lastUsedAt: utcDateSchema,
            expiresAt: utcDateSchema,
            revokedAt: utcDateSchema.nullable(),
          })
          .strict(),
      ),
    })
    .strict(),
  failure: noExpectedFailureSchema,
});
