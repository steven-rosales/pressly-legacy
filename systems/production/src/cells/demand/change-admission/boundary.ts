import { z } from 'zod';

import {
  productionAdmissionOverrideSchema,
  productionAdmissionTargetSchema,
  productionIdSchema,
  productionOrderStatusSchema,
} from '../../../read-models/production-order/contract.ts';

export const productionOrderParamsSchema = z
  .object({
    locationId: z.string().min(1),
    productionOrderId: productionIdSchema,
  })
  .strict();
export const changeProductionAdmissionCommandSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    target: productionAdmissionTargetSchema,
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();

export const changeProductionAdmissionRequestSchema =
  changeProductionAdmissionCommandSchema.omit({
    locationId: true,
    orderId: true,
  });

export const changeProductionAdmissionResultSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: productionIdSchema,
    admissionOverride: productionAdmissionOverrideSchema,
    status: productionOrderStatusSchema,
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export type ChangeProductionAdmissionResult = z.infer<
  typeof changeProductionAdmissionResultSchema
>;
