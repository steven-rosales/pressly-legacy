import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionWorkspaceQuerySchema = z
  .object({ shiftId: productionIdSchema.optional() })
  .strict();

export const productionWorkspaceParamsSchema = z
  .object({
    locationId: z.string().min(1),
    shiftId: productionIdSchema.optional(),
  })
  .strict();
