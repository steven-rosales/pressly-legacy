import { z } from 'zod';
import {
  defineAccessCellContract,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import { noExpectedFailureSchema } from '../../../model/boundary/schemas.ts';
import type { ListEffectiveAccessGrants } from './list-effective-access-grants.usecase.ts';

export const listEffectiveAccessGrantsContract = defineAccessCellContract<
  OperationInput<ListEffectiveAccessGrants>,
  OperationOutput<ListEffectiveAccessGrants>,
  OperationFailure<ListEffectiveAccessGrants>
>({
  label: 'access.list-effective-access-grants.v1',
  input: z.string(),
  output: z
    .object({
      grants: z.array(
        z
          .object({
            businessId: z.string(),
            businessName: z.string(),
            role: z.enum(['owner', 'manager', 'operator']),
            scopeKind: z.enum(['business', 'location']),
            scopeId: z.string(),
          })
          .strict(),
      ),
    })
    .strict(),
  failure: noExpectedFailureSchema,
});
