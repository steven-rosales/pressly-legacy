import { z } from 'zod';
import type { RevokeWorkforceMemberSessions } from './revoke-workforce-member-sessions.usecase.ts';
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

export const revokeWorkforceMemberSessionsContract = defineAccessCellContract<
  OperationInput<RevokeWorkforceMemberSessions>,
  OperationOutput<RevokeWorkforceMemberSessions>,
  OperationFailure<RevokeWorkforceMemberSessions>
>({
  label: 'access.revoke-workforce-member-sessions.v1',
  input: exactOptionalContractSchema<
    OperationInput<RevokeWorkforceMemberSessions>
  >(
    z
      .object({
        actor: workforceActorSchema,
        businessId: z.string(),
        membershipId: z.string(),
        sessionId: z.string().optional(),
        idempotencyKey: z.string(),
      })
      .strict(),
  ),
  output: z
    .object({ revokedCount: z.number(), replayed: z.boolean() })
    .strict(),
  failure: exactOptionalContractSchema<
    OperationFailure<RevokeWorkforceMemberSessions>
  >(workforceFailureSchema),
});
