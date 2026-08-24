import { z } from 'zod';

import { productionIdSchema } from '../../../read-models/production-order/contract.ts';

export const productionOrderParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
  })
  .strict();
export const recordOrderIntakeCommandSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    bagCount: z.number().int().nonnegative(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const recordOrderIntakeRequestSchema =
  recordOrderIntakeCommandSchema.omit({
    locationId: true,
    orderId: true,
  });

export const recordOrderIntakeResultSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    bagCount: z.number().int().nonnegative(),
    bagCountProvenance: z.literal('operator_intake'),
    intakeVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export type RecordOrderIntakeResult = z.infer<
  typeof recordOrderIntakeResultSchema
>;
