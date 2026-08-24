import { z } from 'zod';
import {
  auditedCommandSchema,
  defineStrictCellContract,
  orderMutationResultSchema,
} from '../../../model/canonical-order/contract.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  CancelOrderCommand,
  CancelOrderExpectedFailure,
} from './types.ts';

const inputSchema = z
  .object({
    ...auditedCommandSchema,
    locationId: z.string(),
    orderId: z.string(),
    expectedVersion: z.number(),
    reasonCode: z.enum([
      'customer_canceled',
      'duplicate_order',
      'created_in_error',
      'manager_correction',
    ]),
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

export const cancelOrderContract = defineStrictCellContract<
  CancelOrderCommand,
  OrderMutationResult,
  CancelOrderExpectedFailure
>({
  inputSchema,
  outputSchema: orderMutationResultSchema,
  failureSchema,
  invariantCode: 'cancel_order_contract_invalid',
});
