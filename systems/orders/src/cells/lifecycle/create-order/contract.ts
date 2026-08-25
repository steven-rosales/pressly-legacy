import { z } from 'zod';
import {
  auditedCommandSchema,
  defineStrictCellContract,
  directFulfillmentSchema,
  orderCustomerSchema,
  orderItemSchema,
  orderMutationResultSchema,
  utcDateSchema,
} from '../../../model/canonical-order/contract.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  CreateOrderCommand,
  CreateOrderExpectedFailure,
} from './types.ts';

const inputSchema = z
  .object({
    ...auditedCommandSchema,
    customer: orderCustomerSchema,
    displayNumber: z.string().nullable(),
    dueAt: utcDateSchema,
    currency: z.string(),
    totalAmountCents: z.number(),
    balanceDueCents: z.number().nullable(),
    items: z.array(orderItemSchema),
    fulfillment: directFulfillmentSchema,
    reasonCode: z.enum(['new_customer_order', 'recovery_entry']),
  })
  .strict();

const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('order_create_invalid'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('not_found'),
      code: z.literal('order_reference_not_found'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.literal('order_idempotency_conflict'),
      message: z.string(),
    })
    .strict(),
]);

export const createOrderContract = defineStrictCellContract<
  CreateOrderCommand,
  OrderMutationResult,
  CreateOrderExpectedFailure
>({
  inputSchema,
  outputSchema: orderMutationResultSchema,
  failureSchema,
  invariantCode: 'create_order_contract_invalid',
});
