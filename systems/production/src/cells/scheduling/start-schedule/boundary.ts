import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionHashSchema,
  productionIdSchema,
} from '../../../read-models/production-order/contract.ts';

export const productionScheduleParamsSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
  })
  .strict();
export const startScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
    expectedOutputPlanHash: productionHashSchema,
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const startScheduleRequestSchema = startScheduleCommandSchema.omit({
  locationId: true,
  scheduleRunId: true,
});

export const startScheduleResultSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionRunId: productionIdSchema,
    productionBatchIds: z.array(productionIdSchema),
    queueVersion: z.number().int().positive(),
    startedAt: utcIsoStringSchema,
    replayed: z.boolean(),
  })
  .strict();

export type StartScheduleCommand = z.infer<typeof startScheduleCommandSchema>;
export type StartScheduleResult = z.infer<typeof startScheduleResultSchema>;
