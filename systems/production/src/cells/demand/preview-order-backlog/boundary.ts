import { z } from 'zod';

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();
