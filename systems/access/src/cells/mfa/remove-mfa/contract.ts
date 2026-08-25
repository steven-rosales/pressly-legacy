import { z } from 'zod';
import type { RemoveMfa } from './remove-mfa.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';

export const removeMfaContract = defineAccessCellContract<
  OperationInput<RemoveMfa>,
  OperationOutput<RemoveMfa>,
  OperationFailure<RemoveMfa>
>({
  label: 'access.remove-mfa.v1',
  input: exactOptionalContractSchema<OperationInput<RemoveMfa>>(
    z
      .object({
        identityId: z.string(),
        sessionId: z.string(),
        requestId: z.string().optional(),
      })
      .strict(),
  ),
  output: z.object({ updated: z.literal(true) }).strict(),
  failure: noExpectedFailureSchema,
});
