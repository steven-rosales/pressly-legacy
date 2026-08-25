import { z } from 'zod';
import type { IssueWorkforceInvitation } from './issue-workforce-invitation.usecase.ts';
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
  workforceRoleSchema,
} from '../../../../model/boundary/schemas.ts';

export const issueWorkforceInvitationContract = defineAccessCellContract<
  OperationInput<IssueWorkforceInvitation>,
  OperationOutput<IssueWorkforceInvitation>,
  OperationFailure<IssueWorkforceInvitation>
>({
  label: 'access.issue-workforce-invitation.v1',
  input: z
    .object({
      actor: workforceActorSchema,
      businessId: z.string(),
      email: z.string(),
      displayName: z.string(),
      intendedRole: workforceRoleSchema,
      intendedLocationId: z.string().nullable(),
      idempotencyKey: z.string(),
    })
    .strict(),
  output: z.discriminatedUnion('status', [
    z
      .object({
        status: z.literal('issued'),
        invitation: workforceInvitationSchema,
        token: z.string(),
      })
      .strict(),
    z
      .object({
        status: z.literal('replayed'),
        invitation: workforceInvitationSchema,
      })
      .strict(),
  ]),
  failure: exactOptionalContractSchema<
    OperationFailure<IssueWorkforceInvitation>
  >(workforceFailureSchema),
});
