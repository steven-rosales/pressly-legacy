import { z } from 'zod';
import type { ListWorkforceSecurityEvents } from './list-workforce-security-events.usecase.ts';
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

export const listWorkforceSecurityEventsContract = defineAccessCellContract<
  OperationInput<ListWorkforceSecurityEvents>,
  OperationOutput<ListWorkforceSecurityEvents>,
  OperationFailure<ListWorkforceSecurityEvents>
>({
  label: 'access.list-workforce-security-events.v1',
  input: exactOptionalContractSchema<
    OperationInput<ListWorkforceSecurityEvents>
  >(
    z
      .object({
        actor: workforceActorSchema,
        businessId: z.string(),
        cursor: z.string().optional(),
        limit: z.number().optional(),
      })
      .strict(),
  ),
  output: z
    .object({
      events: z.array(
        z
          .object({
            id: z.string(),
            eventType: z.string(),
            resourceType: z.string(),
            actorDisplayName: z.string().nullable(),
            createdAt: z.string(),
          })
          .strict(),
      ),
      nextCursor: z.string().nullable(),
    })
    .strict(),
  failure: exactOptionalContractSchema<
    OperationFailure<ListWorkforceSecurityEvents>
  >(workforceFailureSchema),
});
