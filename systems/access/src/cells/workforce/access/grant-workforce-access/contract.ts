import { z } from 'zod';
import type { GrantWorkforceAccess } from './grant-workforce-access.usecase.ts';
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
  workforceRoleSchema,
  workforceScopeSchema,
  utcDateSchema,
} from '../../../../model/boundary/schemas.ts';

export const grantWorkforceAccessContract = defineAccessCellContract<
  OperationInput<GrantWorkforceAccess>,
  OperationOutput<GrantWorkforceAccess>,
  OperationFailure<GrantWorkforceAccess>
>({
  label: 'access.grant-workforce-access.v1',
  input: exactOptionalContractSchema<OperationInput<GrantWorkforceAccess>>(
    z
      .object({
        actor: workforceActorSchema,
        businessId: z.string(),
        membershipId: z.string(),
        identityId: z.string(),
        role: workforceRoleSchema,
        scope: workforceScopeSchema,
        startsAt: utcDateSchema.optional(),
        endsAt: utcDateSchema.optional(),
        idempotencyKey: z.string(),
      })
      .strict(),
  ),
  output: accessGrantSchema,
  failure: exactOptionalContractSchema<OperationFailure<GrantWorkforceAccess>>(
    workforceFailureSchema,
  ),
});
