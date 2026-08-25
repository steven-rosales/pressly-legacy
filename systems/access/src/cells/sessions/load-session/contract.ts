import { z } from 'zod';
import type { LoadSession } from './load-session.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { loadedSessionSchema } from '../../../model/boundary/schemas.ts';

export const loadSessionContract = defineAccessCellContract<
  OperationInput<LoadSession>,
  OperationOutput<LoadSession>,
  OperationFailure<LoadSession>
>({
  label: 'access.load-session.v1',
  input: z.object({ bearerToken: z.string() }).strict(),
  output:
    exactOptionalContractSchema<OperationOutput<LoadSession>>(
      loadedSessionSchema,
    ),
  failure: z
    .object({
      kind: z.literal('authentication'),
      code: z.enum(['invalid_session', 'session_expired']),
      message: z.string(),
    })
    .strict(),
});
