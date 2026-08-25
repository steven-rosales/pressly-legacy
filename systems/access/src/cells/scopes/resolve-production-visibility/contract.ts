import { z } from 'zod';
import type { ResolveProductionVisibility } from './resolve-production-visibility.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../model/boundary/cell-contract.ts';
import {
  noExpectedFailureSchema,
  roleAssignmentSchema,
} from '../../../model/boundary/schemas.ts';

export const resolveProductionVisibilityContract = defineAccessCellContract<
  OperationInput<ResolveProductionVisibility>,
  OperationOutput<ResolveProductionVisibility>,
  OperationFailure<ResolveProductionVisibility>
>({
  label: 'access.resolve-production-visibility.v1',
  input: exactOptionalContractSchema<
    OperationInput<ResolveProductionVisibility>
  >(
    z
      .object({
        principalAttributes: z
          .object({
            assignments: z.array(roleAssignmentSchema),
            identityActive: z.boolean(),
            assuranceLevel: z
              .enum(['password', 'mfa', 'service_key'])
              .optional(),
          })
          .strict(),
      })
      .strict(),
  ),
  output: z.array(z.string()),
  failure: noExpectedFailureSchema,
});
