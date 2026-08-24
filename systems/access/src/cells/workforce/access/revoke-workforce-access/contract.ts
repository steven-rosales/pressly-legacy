import { z } from 'zod';
import type { RevokeWorkforceAccess } from './revoke-workforce-access.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';
import {
  accessGrantSchema,
  workforceActorSchema,
  workforceFailureSchema,
} from '../../../../model/boundary/schemas.ts';

export const revokeWorkforceAccessContract = defineAccessCellContract<
  OperationInput<RevokeWorkforceAccess>,
  OperationOutput<RevokeWorkforceAccess>,
  OperationFailure<RevokeWorkforceAccess>
>({
  label: 'access.revoke-workforce-access.v1',
  input: exactOptionalContractSchema<OperationInput<RevokeWorkforceAccess>>(
    z
      .object({
        actor: workforceActorSchema,
        businessId: z.string(),
        grantId: z.string(),
        expectedVersion: z.number(),
        reason: z.string().optional(),
        idempotencyKey: z.string(),
      })
      .strict(),
  ),
  output: z
    .object({ grant: accessGrantSchema, revokedSessionCount: z.number() })
    .strict(),
  failure: exactOptionalContractSchema<OperationFailure<RevokeWorkforceAccess>>(
    workforceFailureSchema,
  ),
});
