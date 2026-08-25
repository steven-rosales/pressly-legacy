import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import {
  productionIdSchema,
  productionWarningCodeSchema,
} from '../../../read-models/production-order/contract.ts';

export const productionScheduleParamsSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
  })
  .strict();
export const acceptScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
    expectedOutputPlanHash: z.string().regex(/^[a-f0-9]{64}$/),
    acknowledgedWarningCodes: z.array(productionWarningCodeSchema),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const acceptScheduleRequestSchema = acceptScheduleCommandSchema.omit({
  locationId: true,
  scheduleRunId: true,
});

export const acceptScheduleResultSchema = z
  .object({
    scheduleRunId: productionIdSchema,
    productionShiftId: productionIdSchema,
    acceptedAt: utcIsoStringSchema,
    replayed: z.boolean(),
  })
  .strict();

export type AcceptScheduleCommand = z.infer<typeof acceptScheduleCommandSchema>;
export type AcceptScheduleResult = z.infer<typeof acceptScheduleResultSchema>;
