import { z } from 'zod';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';
import {
  workforceActorSchema,
  workforceFailureSchema,
  workforceMemberDetailSchema,
} from '../../../../model/boundary/schemas.ts';
import type {
  TransitionWorkforceMembership,
  TransitionWorkforceMembershipOperationCommand,
} from './transition-workforce-membership.usecase.ts';

export const transitionWorkforceMembershipContract = defineAccessCellContract<
  TransitionWorkforceMembershipOperationCommand,
  OperationOutput<TransitionWorkforceMembership>,
  OperationFailure<TransitionWorkforceMembership>
>({
  label: 'access.transition-workforce-membership.v1',
  input:
    exactOptionalContractSchema<TransitionWorkforceMembershipOperationCommand>(
      z
        .object({
          actor: workforceActorSchema,
          businessId: z.string(),
          membershipId: z.string(),
          expectedVersion: z.number(),
          event: z.enum(['suspend', 'reactivate', 'end']),
          reason: z.string().optional(),
          idempotencyKey: z.string(),
        })
        .strict(),
    ),
  output: z
    .object({
      member: workforceMemberDetailSchema,
      revokedSessionCount: z.number(),
    })
    .strict(),
  failure: exactOptionalContractSchema<
    OperationFailure<TransitionWorkforceMembership>
  >(workforceFailureSchema),
});
