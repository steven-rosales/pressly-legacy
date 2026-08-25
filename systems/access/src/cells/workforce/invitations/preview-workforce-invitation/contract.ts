import { z } from 'zod';
import type { PreviewWorkforceInvitation } from './preview-workforce-invitation.usecase.ts';
import {
  defineAccessCellContract,
  exactOptionalContractSchema,
  type OperationFailure,
  type OperationInput,
  type OperationOutput,
} from '../../../../model/boundary/cell-contract.ts';
import { workforceInvitationPreviewSchema } from '../../../../model/boundary/schemas.ts';

export const previewWorkforceInvitationContract = defineAccessCellContract<
  OperationInput<PreviewWorkforceInvitation>,
  OperationOutput<PreviewWorkforceInvitation>,
  OperationFailure<PreviewWorkforceInvitation>
>({
  label: 'access.preview-workforce-invitation.v1',
  input: z.string(),
  output: workforceInvitationPreviewSchema,
  failure: exactOptionalContractSchema<
    OperationFailure<PreviewWorkforceInvitation>
  >(
    z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('validation'),
          code: z.string(),
          message: z.string(),
          details: z
            .object({ field: z.string().optional() })
            .strict()
            .optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('not_found'),
          code: z.literal('workforce_invitation_not_found'),
          message: z.string(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('conflict'),
          code: z.enum(['workforce_invalid_state', 'workforce_expired_token']),
          message: z.string(),
        })
        .strict(),
    ]),
  ),
});
