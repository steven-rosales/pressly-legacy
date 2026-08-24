import { z } from 'zod';
import type { ReissueWorkforceInvitation } from './reissue-workforce-invitation.usecase.ts';
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

export const reissueWorkforceInvitationContract = defineAccessCellContract<
  OperationInput<ReissueWorkforceInvitation>,
  OperationOutput<ReissueWorkforceInvitation>,
  OperationFailure<ReissueWorkforceInvitation>
>({
  label: 'access.reissue-workforce-invitation.v1',
  input: z
    .object({
      actor: workforceActorSchema,
      invitationId: z.string(),
      businessId: z.string(),
      expectedVersion: z.number(),
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
    OperationFailure<ReissueWorkforceInvitation>
  >(workforceFailureSchema),
});
