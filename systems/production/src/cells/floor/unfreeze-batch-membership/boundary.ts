import { z } from 'zod';

import { productionBatchMembershipSchema } from '../../../read-models/production-board/contract.ts';
import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionRunParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
  })
  .strict();

export const unfreezeProductionBatchRequestSchema = z
  .object({
    expectedQueueVersion: z.number().int().positive(),
    expectedBatchVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const productionBatchMembershipMutationResultSchema = z
  .object({
    productionRunId: productionIdSchema,
    productionBatchId: productionIdSchema,
    queueVersion: z.number().int().positive(),
    batchVersion: z.number().int().positive(),
    membership: productionBatchMembershipSchema,
    replayed: z.boolean(),
  })
  .strict();

export type ProductionBatchMembershipMutationResult = z.infer<
  typeof productionBatchMembershipMutationResultSchema
>;
