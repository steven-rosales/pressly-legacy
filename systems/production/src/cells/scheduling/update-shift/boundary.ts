import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';
import { productionShiftSchema } from '../../../read-models/production-schedule/contract.ts';

export const productionShiftParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
  })
  .strict();

const productionShiftUpdateFields = {
  startsAt: utcIsoStringSchema,
  endsAt: utcIsoStringSchema,
  effectiveFolderCount: z.number().int().positive(),
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

const validProductionShiftUpdateWindow = (value: {
  startsAt: string;
  endsAt: string;
}) => Date.parse(value.endsAt) > Date.parse(value.startsAt);

export const updateProductionShiftCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    ...productionShiftUpdateFields,
  })
  .strict()
  .refine(
    validProductionShiftUpdateWindow,
    'Shift end must be after its start.',
  );

export const updateProductionShiftRequestSchema = z
  .object(productionShiftUpdateFields)
  .strict()
  .refine(
    validProductionShiftUpdateWindow,
    'Shift end must be after its start.',
  );

export const updateProductionShiftResultSchema = z
  .object({
    productionShift: productionShiftSchema,
    supersededScheduleRunId: productionIdSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

export type UpdateProductionShiftResult = z.infer<
  typeof updateProductionShiftResultSchema
>;
