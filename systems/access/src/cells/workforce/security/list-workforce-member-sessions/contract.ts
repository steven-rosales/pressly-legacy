import { z } from 'zod';
import type { ListWorkforceMemberSessions } from './list-workforce-member-sessions.usecase.ts';
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
} from '../../../../model/boundary/schemas.ts';

export const listWorkforceMemberSessionsContract = defineAccessCellContract<
  OperationInput<ListWorkforceMemberSessions>,
  OperationOutput<ListWorkforceMemberSessions>,
  OperationFailure<ListWorkforceMemberSessions>
>({
  label: 'access.list-workforce-member-sessions.v1',
  input: z
    .object({
      actor: workforceActorSchema,
      businessId: z.string(),
      membershipId: z.string(),
    })
    .strict(),
  output: z
    .object({
      sessions: z.array(
        z
          .object({
            id: z.string(),
            issuedAt: z.string(),
            lastUsedAt: z.string(),
            expiresAt: z.string(),
            revokedAt: z.string().nullable(),
            current: z.boolean(),
          })
          .strict(),
      ),
    })
    .strict(),
  failure: exactOptionalContractSchema<
    OperationFailure<ListWorkforceMemberSessions>
  >(workforceFailureSchema),
});
