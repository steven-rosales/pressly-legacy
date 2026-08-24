import { z } from 'zod';
import type { AcceptWorkforceInvitation } from './accept-workforce-invitation.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';
import {
  workforceFailureSchema,
  workforceInvitationSchema,
} from '../../../../model/boundary/schemas.ts';

export const acceptWorkforceInvitationContract = defineAccessCellContract<
  OperationInput<AcceptWorkforceInvitation>,
  OperationOutput<AcceptWorkforceInvitation>,
  OperationFailure<AcceptWorkforceInvitation>
>({
  label: 'access.accept-workforce-invitation.v1',
  input: z
    .object({
      rawToken: z.string(),
      idempotencyKey: z.string(),
      acceptance: z.discriminatedUnion('kind', [
        z
          .object({ kind: z.literal('new_identity'), password: z.string() })
          .strict(),
        z
          .object({
            kind: z.literal('existing_identity'),
            authenticatedIdentityId: z.string(),
            authenticatedSessionId: z.string(),
          })
          .strict(),
      ]),
    })
    .strict(),
  output: z
    .object({
      invitation: workforceInvitationSchema,
      identityId: z.string(),
      membershipId: z.string(),
      identityCreated: z.boolean(),
      privilegedAccessEffective: z.boolean(),
      replayed: z.boolean(),
    })
    .strict(),
  failure: exactOptionalContractSchema<
    OperationFailure<AcceptWorkforceInvitation>
  >(workforceFailureSchema),
});
