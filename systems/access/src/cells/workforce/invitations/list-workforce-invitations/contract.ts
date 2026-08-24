import { z } from 'zod';
import type { ListWorkforceInvitations } from './list-workforce-invitations.usecase.ts';
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
  workforceInvitationSchema,
} from '../../../../model/boundary/schemas.ts';

export const listWorkforceInvitationsContract = defineAccessCellContract<
  OperationInput<ListWorkforceInvitations>,
  OperationOutput<ListWorkforceInvitations>,
  OperationFailure<ListWorkforceInvitations>
>({
  label: 'access.list-workforce-invitations.v1',
  input: exactOptionalContractSchema<OperationInput<ListWorkforceInvitations>>(
    z
      .object({
        actor: workforceActorSchema,
        businessId: z.string(),
        includeTerminal: z.boolean().optional(),
        cursor: z.string().optional(),
        limit: z.number().optional(),
      })
      .strict(),
  ),
  output: z
    .object({
      invitations: z.array(workforceInvitationSchema),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  failure: exactOptionalContractSchema<
    OperationFailure<ListWorkforceInvitations>
  >(workforceFailureSchema),
});
