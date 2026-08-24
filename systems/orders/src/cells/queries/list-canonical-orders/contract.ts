import { z } from 'zod';
import {
  canonicalOrderSummarySchema,
  defineStrictCellContract,
} from '../../../model/canonical-order/contract.ts';
import type {
  CanonicalOrderListResult,
  ListCanonicalOrdersExpectedFailure,
  ListCanonicalOrdersQuery,
} from './types.ts';

const inputSchema = z
  .object({
    businessId: z.string(),
    locationIds: z.array(z.string()),
    query: z.string().nullable(),
    state: z.enum(['open', 'completed', 'canceled']).nullable(),
    limit: z.number(),
    cursor: z.string().nullable(),
  })
  .strict();
const outputSchema = z
  .object({
    items: z.array(canonicalOrderSummarySchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
const failureSchema = z
  .object({
    kind: z.literal('validation'),
    code: z.enum(['order_list_invalid', 'order_cursor_invalid']),
    message: z.string(),
  })
  .strict();

export const listCanonicalOrdersContract = defineStrictCellContract<
  ListCanonicalOrdersQuery,
  CanonicalOrderListResult,
  ListCanonicalOrdersExpectedFailure
>({
  inputSchema,
  outputSchema,
  failureSchema,
  invariantCode: 'list_canonical_orders_contract_invalid',
});
