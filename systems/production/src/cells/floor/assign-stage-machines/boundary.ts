import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionStageParamsSchema = z
  .object({
    locationId: z.string().min(1),
    stageRunId: productionIdSchema,
  })
  .strict();

export const assignStageMachinesRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    machineIds: z.array(productionIdSchema).min(1),
  })
  .strict();

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
