import { z } from 'zod';
import {
  auditedCommandSchema,
  defineStrictCellContract,
  orderMutationResultSchema,
} from '../../../model/canonical-order/contract.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  CompleteOrderCommand,
  CompleteOrderExpectedFailure,
} from './types.ts';

const inputSchema = z
  .object({
    ...auditedCommandSchema,
    locationId: z.string(),
    orderId: z.string(),
    expectedVersion: z.number(),
    reasonCode: z.enum(['service_completed', 'manager_correction']),
  })
  .strict();

const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('order_lifecycle_command_invalid'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('not_found'),
      code: z.literal('order_not_found'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.enum([
        'order_version_conflict',
        'order_transition_invalid',
        'order_idempotency_conflict',
      ]),
      message: z.string(),
    })
    .strict(),
]);

export const completeOrderContract = defineStrictCellContract<
  CompleteOrderCommand,
  OrderMutationResult,
  CompleteOrderExpectedFailure
>({
  inputSchema,
  outputSchema: orderMutationResultSchema,
  failureSchema,
  invariantCode: 'complete_order_contract_invalid',
});
