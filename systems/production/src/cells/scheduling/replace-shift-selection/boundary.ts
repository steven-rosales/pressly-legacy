import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';
import { productionShiftSelectionSchema } from '../../../read-models/production-schedule/contract.ts';

export const productionShiftParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
  })
  .strict();

const replaceProductionShiftSelectionFields = {
  selectedOrderIds: z
    .array(productionIdSchema)
    .max(1000)
    .superRefine((orderIds, context) => {
      if (new Set(orderIds).size !== orderIds.length)
        context.addIssue({
          code: 'custom',
          message: 'Selected order IDs must be unique.',
        });
    }),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(200),
} as const;

export const replaceProductionShiftSelectionCommandSchema = z
  .object({
    locationId: z.string().min(1),
    productionShiftId: productionIdSchema,
    ...replaceProductionShiftSelectionFields,
  })
  .strict();

export const replaceProductionShiftSelectionRequestSchema = z
  .object(replaceProductionShiftSelectionFields)
  .strict();

export const replaceProductionShiftSelectionResultSchema = z
  .object({
    selection: productionShiftSelectionSchema,
    supersededScheduleRunId: productionIdSchema.nullable(),
    replayed: z.boolean(),
  })
  .strict();

export type ReplaceProductionShiftSelectionCommand = z.infer<
  typeof replaceProductionShiftSelectionCommandSchema
>;
export type ReplaceProductionShiftSelectionResult = z.infer<
  typeof replaceProductionShiftSelectionResultSchema
>;
