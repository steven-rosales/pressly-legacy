import { z } from 'zod';
import type { GetWorkforceMember } from './get-workforce-member.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';
import {
  workforceActorSchema,
  workforceFailureSchema,
  workforceMemberDetailSchema,
} from '../../../../model/boundary/schemas.ts';

export const getWorkforceMemberContract = defineAccessCellContract<
  OperationInput<GetWorkforceMember>,
  OperationOutput<GetWorkforceMember>,
  OperationFailure<GetWorkforceMember>
>({
  label: 'access.get-workforce-member.v1',
  input: z
    .object({
      actor: workforceActorSchema,
      businessId: z.string(),
      membershipId: z.string(),
    })
    .strict(),
  output: workforceMemberDetailSchema,
  failure: exactOptionalContractSchema<OperationFailure<GetWorkforceMember>>(
    workforceFailureSchema,
  ),
});
