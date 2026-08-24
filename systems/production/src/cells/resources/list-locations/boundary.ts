import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import { productionLocationSchema } from '../../../read-models/production-resources/contract.ts';

const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]);
export const listProductionLocationsQuerySchema = z
  .object({ includeInactive: queryBooleanSchema.optional().default(false) })
  .strict();

export const listProductionLocationsResultSchema = z
  .object({
    items: z.array(productionLocationSchema),
    asOf: utcIsoStringSchema,
  })
  .strict();

export type ListProductionLocationsQuery = z.infer<
  typeof listProductionLocationsQuerySchema
>;
export type ListProductionLocationsResult = z.infer<
  typeof listProductionLocationsResultSchema
>;
