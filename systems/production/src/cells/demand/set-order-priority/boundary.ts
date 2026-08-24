import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionOrderParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
  })
  .strict();
export const setProductionOrderPriorityCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
    priority: z.boolean(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const setProductionOrderPriorityRequestSchema =
  setProductionOrderPriorityCommandSchema.omit({
    locationId: true,
    productionOrderId: true,
  });

export const productionMutationResultSchema = z
  .object({
    entityId: productionIdSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export type ProductionMutationResult = z.infer<
  typeof productionMutationResultSchema
>;
