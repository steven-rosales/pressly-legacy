import { z } from 'zod';
import type { ListWorkforce } from './list-workforce.usecase.ts';
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
  workforcePageSchema,
} from '../../../../model/boundary/schemas.ts';

export const listWorkforceContract = defineAccessCellContract<
  OperationInput<ListWorkforce>,
  OperationOutput<ListWorkforce>,
  OperationFailure<ListWorkforce>
>({
  label: 'access.list-workforce.v1',
  input: exactOptionalContractSchema<OperationInput<ListWorkforce>>(
    z
      .object({
        actor: workforceActorSchema,
        businessId: z.string(),
        states: z.array(z.enum(['active', 'suspended', 'ended'])).optional(),
        query: z.string().optional(),
        cursor: z.string().optional(),
        limit: z.number().optional(),
      })
      .strict(),
  ),
  output: workforcePageSchema,
  failure: exactOptionalContractSchema<OperationFailure<ListWorkforce>>(
    workforceFailureSchema,
  ),
});
