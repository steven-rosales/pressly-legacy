import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const canonicalOrderParamsSchema = z
  .object({
    locationId: z.string().min(1),
    orderId: z.string().uuid(),
  })
  .strict();

export const canonicalFulfillmentParamsSchema = z
  .object({
    locationId: z.string().min(1),
    fulfillmentId: z.string().uuid(),
  })
  .strict();

export const directOrderCustomerSchema = z.discriminatedUnion('resolution', [
  z
    .object({
      resolution: z.literal('resolved'),
      userId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      resolution: z.literal('not_provided'),
      userId: z.null(),
    })
    .strict(),
]);

export const orderItemInputSchema = z
  .object({
    lineKey: z.string().min(1),
    itemType: z.string().min(1),
    code: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().nonnegative(),
    unit: z.string().min(1),
    unitPriceCents: z.number().int().nonnegative(),
    totalAmountCents: z.number().int().nonnegative(),
    sourceMetadata: z.unknown(),
  })
  .strict();

export const fulfillmentInputSchema = z
  .object({
    typeCode: z.string().min(1),
    locationId: z.string().min(1),
    releaseState: z.enum(['unreleased', 'released', 'withdrawn']),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().min(1).nullable(),
    bagCount: z.number().int().nonnegative().nullable(),
  })
  .strict()
  .refine(
    (value) =>
      (value.estimatedWeightLbs === null) ===
      (value.estimatedWeightSource === null),
    {
      message: 'Weight and provenance must either both exist or both be null.',
    },
  );

export const createOrderRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    customer: directOrderCustomerSchema,
    displayNumber: z.string().min(1).nullable(),
    state: z.enum(['open', 'completed', 'canceled']).default('open'),
    dueAt: utcIsoStringSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    items: z.array(orderItemInputSchema),
    fulfillment: fulfillmentInputSchema,
  })
  .strict();

export const updateOrderRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    changes: z
      .object({
        customer: directOrderCustomerSchema.optional(),
        displayNumber: z.string().min(1).nullable().optional(),
        state: z.enum(['open', 'completed', 'canceled']).optional(),
        dueAt: utcIsoStringSchema.optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        totalAmountCents: z.number().int().nonnegative().optional(),
        balanceDueCents: z.number().int().nonnegative().nullable().optional(),
      })
      .strict(),
  })
  .strict();

export const changeFulfillmentReleaseRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    target: z.enum(['unreleased', 'released', 'withdrawn']),
  })
  .strict();

export const orderMutationResultSchema = z
  .object({
    orderId: z.string().uuid(),
    fulfillmentId: z.string().uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type UpdateOrderRequest = z.infer<typeof updateOrderRequestSchema>;
export type ChangeFulfillmentReleaseRequest = z.infer<
  typeof changeFulfillmentReleaseRequestSchema
>;
export type OrderMutationResult = z.infer<typeof orderMutationResultSchema>;
