import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionScheduleParamsSchema = z
  .object({
    locationId: z.string().min(1),
    scheduleRunId: productionIdSchema,
  })
  .strict();
