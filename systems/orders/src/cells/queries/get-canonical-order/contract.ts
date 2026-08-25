import { z } from 'zod';
import {
  canonicalOrderSummarySchema,
  defineStrictCellContract,
  orderItemSchema,
} from '../../../model/canonical-order/contract.ts';
import type { CanonicalOrderDetail } from '../../../model/canonical-order/model.ts';
import type {
  GetCanonicalOrderExpectedFailure,
  GetCanonicalOrderQuery,
} from './types.ts';

const inputSchema = z
  .object({
    businessId: z.string(),
    locationIds: z.array(z.string()),
    orderId: z.string(),
  })
  .strict();
const outputSchema = canonicalOrderSummarySchema.extend({
  items: z.array(orderItemSchema),
});
const failureSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('validation'),
      code: z.literal('order_get_invalid'),
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
]);

export const getCanonicalOrderContract = defineStrictCellContract<
  GetCanonicalOrderQuery,
  CanonicalOrderDetail,
  GetCanonicalOrderExpectedFailure
>({
  inputSchema,
  outputSchema,
  failureSchema,
  invariantCode: 'get_canonical_order_contract_invalid',
});
