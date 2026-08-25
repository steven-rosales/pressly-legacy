import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionRunBoardParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionRunId: productionIdSchema,
  })
  .strict();
