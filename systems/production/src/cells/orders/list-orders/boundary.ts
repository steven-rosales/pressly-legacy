import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionOrderListItemSchema,
  productionOrderStatusSchema,
} from '../../../read-models/production-order/contract.ts';

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();
export const listProductionOrdersQuerySchema = z
  .object({
    status: productionOrderStatusSchema.optional(),
    dueAfter: utcIsoStringSchema.optional(),
    dueBefore: utcIsoStringSchema.optional(),
    cursor: z.string().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(
    (query) =>
      query.dueAfter === undefined ||
      query.dueBefore === undefined ||
      Date.parse(query.dueBefore) > Date.parse(query.dueAfter),
    { path: ['dueBefore'], message: 'dueBefore must be after dueAfter.' },
  );

export const listProductionOrdersResultSchema = z
  .object({
    items: z.array(productionOrderListItemSchema),
    nextCursor: z.string().min(1).nullable(),
    asOf: utcIsoStringSchema,
  })
  .strict();

export type ListProductionOrdersQuery = z.infer<
  typeof listProductionOrdersQuerySchema
>;
export type ListProductionOrdersResult = z.infer<
  typeof listProductionOrdersResultSchema
>;
