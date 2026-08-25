import { z } from 'zod';
import type { RevokeWorkforceInvitation } from './revoke-workforce-invitation.usecase.ts';
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

export const revokeWorkforceInvitationContract = defineAccessCellContract<
  OperationInput<RevokeWorkforceInvitation>,
  OperationOutput<RevokeWorkforceInvitation>,
  OperationFailure<RevokeWorkforceInvitation>
>({
  label: 'access.revoke-workforce-invitation.v1',
  input: exactOptionalContractSchema<OperationInput<RevokeWorkforceInvitation>>(
    z
      .object({
        actor: workforceActorSchema,
        invitationId: z.string(),
        businessId: z.string(),
        expectedVersion: z.number(),
        reason: z.string().optional(),
        idempotencyKey: z.string(),
      })
      .strict(),
  ),
  output: workforceInvitationSchema,
  failure: exactOptionalContractSchema<
    OperationFailure<RevokeWorkforceInvitation>
  >(workforceFailureSchema),
});
