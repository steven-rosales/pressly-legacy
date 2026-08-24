import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();
export const createScheduleCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    schedulerConfigId: productionIdSchema,
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const createScheduleRequestSchema = createScheduleCommandSchema.omit({
  locationId: true,
});

export type CreateScheduleCommand = z.infer<typeof createScheduleCommandSchema>;
