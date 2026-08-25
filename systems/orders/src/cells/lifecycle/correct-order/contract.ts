import { z } from 'zod';
import {
  auditedCommandSchema,
  defineStrictCellContract,
  orderCustomerSchema,
  orderItemSchema,
  orderMutationResultSchema,
  utcDateSchema,
} from '../../../model/canonical-order/contract.ts';
import type { OrderMutationResult } from '../../../model/canonical-order/model.ts';
import type {
  CorrectOrderCommand,
  CorrectOrderExpectedFailure,
} from './types.ts';

const changesSchema = z
  .object({
    customer: orderCustomerSchema.optional(),
    displayNumber: z.string().nullable().optional(),
    dueAt: utcDateSchema.optional(),
    currency: z.string().optional(),
    totalAmountCents: z.number().optional(),
    balanceDueCents: z.number().nullable().optional(),
    items: z.array(orderItemSchema).optional(),
    fulfillment: z
      .object({
        typeCode: z.string().optional(),
        locationId: z.string().optional(),
        estimatedWeight: z
          .object({
            lbs: z.number().nullable(),
            source: z.string().nullable(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const inputSchema = z
  .object({
    ...auditedCommandSchema,
    locationId: z.string(),
    orderId: z.string(),
    expectedOrderVersion: z.number(),
    expectedFulfillmentVersion: z.number(),
    changes: changesSchema,
    reasonCode: z.enum([
      'customer_correction',
      'manager_correction',
      'source_discrepancy',
    ]),
  })
  .strict();

const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('order_correction_invalid'),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('not_found'),
      code: z.enum(['order_not_found', 'order_customer_not_found']),
      message: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('conflict'),
      code: z.enum([
        'order_version_conflict',
        'order_location_move_requires_command',
        'fulfillment_commitment_conflict',
        'order_idempotency_conflict',
      ]),
      message: z.string(),
    })
    .strict(),
]);

export const correctOrderContract = defineStrictCellContract<
  CorrectOrderCommand,
  OrderMutationResult,
  CorrectOrderExpectedFailure
>({
  inputSchema,
  outputSchema: orderMutationResultSchema,
  failureSchema,
  invariantCode: 'correct_order_contract_invalid',
});
