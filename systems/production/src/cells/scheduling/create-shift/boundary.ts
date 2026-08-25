import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

export const productionLocationParamsSchema = z
  .object({ locationId: z.string().min(1) })
  .strict();
export const createProductionShiftCommandSchema = z
  .object({
    locationId: z.string().min(1),
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Shift end must be after its start.',
  );

export const createProductionShiftRequestSchema = z
  .object({
    startsAt: utcIsoStringSchema,
    endsAt: utcIsoStringSchema,
    timezone: z.string().min(1),
    effectiveFolderCount: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict()
  .refine(
    (value) => Date.parse(value.endsAt) > Date.parse(value.startsAt),
    'Shift end must be after its start.',
  );

export type CreateProductionShiftCommand = z.infer<
  typeof createProductionShiftCommandSchema
>;
