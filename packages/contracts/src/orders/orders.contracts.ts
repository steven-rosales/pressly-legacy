import { z } from 'zod';
import { jsonObjectSchema } from '@pressly/codec/zod';
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
    sourceMetadata: jsonObjectSchema,
  })
  .strict();

export const directFulfillmentInputSchema = z
  .object({
    typeCode: z.string().min(1),
    locationId: z.string().min(1),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().min(1).nullable(),
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

const reasonNoteSchema = z.string().trim().min(1).max(1_000).nullable();

export const incomingOrderProposalStateSchema = z.enum([
  'pending',
  'source_closed',
  'restored_pending',
  'accepted',
  'rejected',
]);

export const incomingOrderProposalActionSchema = z.enum([
  'accept',
  'reject',
  'restore',
]);

export const incomingOrderProposalSchema = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    state: z.enum(['pending', 'source_closed', 'restored_pending']),
    source: z.string().min(1),
    externalOrderId: z.string().min(1),
    locationId: z.string().min(1),
    displayNumber: z.string().min(1).nullable(),
    customer: z
      .object({
        displayName: z.string().min(1).nullable(),
        phone: z.string().min(1).nullable(),
        email: z.string().min(1).nullable(),
      })
      .strict()
      .nullable(),
    dueAt: utcIsoStringSchema,
    estimatedWeightLbs: z.number().positive().nullable(),
    sourceReportedAt: utcIsoStringSchema,
    reportedAt: utcIsoStringSchema,
    sourceClosure: z
      .object({
        kind: z.enum(['completed', 'canceled']),
        observedAt: utcIsoStringSchema,
      })
      .strict()
      .nullable(),
    availableActions: z
      .array(incomingOrderProposalActionSchema)
      .max(2)
      .refine((actions) => new Set(actions).size === actions.length),
    acceptBlockedReason: z.literal('exact_order_exists').nullable(),
  })
  .strict();

export const incomingOrderProposalListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).optional(),
    view: z.enum(['needs_review', 'source_closed']).default('needs_review'),
  })
  .strict();

export const incomingOrderProposalListSchema = z
  .object({
    items: z.array(incomingOrderProposalSchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export const incomingOrderProposalParamsSchema = z
  .object({
    locationId: z.string().min(1),
    proposalId: z.string().uuid(),
  })
  .strict();

export const acceptIncomingOrderProposalRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.literal('incoming_order_accepted'),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const rejectIncomingOrderProposalRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum([
      'already_handled',
      'duplicate_order',
      'not_pressly_work',
      'manager_rejected',
    ]),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const restoreIncomingOrderProposalRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.literal('source_closure_overridden'),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const incomingOrderProposalDecisionResultSchema = z.discriminatedUnion(
  'state',
  [
    z
      .object({
        proposalId: z.string().uuid(),
        state: z.literal('accepted'),
        version: z.number().int().positive(),
        orderId: z.string().uuid(),
        fulfillmentId: z.string().uuid(),
        replayed: z.boolean(),
      })
      .strict(),
    z
      .object({
        proposalId: z.string().uuid(),
        state: z.literal('rejected'),
        version: z.number().int().positive(),
        orderId: z.null(),
        fulfillmentId: z.null(),
        replayed: z.boolean(),
      })
      .strict(),
  ],
);

export const restoreIncomingOrderProposalResultSchema = z
  .object({
    proposalId: z.string().uuid(),
    state: z.literal('restored_pending'),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict();

export const createOrderRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum(['new_customer_order', 'recovery_entry']),
    reasonNote: reasonNoteSchema,
    customer: directOrderCustomerSchema,
    displayNumber: z.string().min(1).nullable(),
    dueAt: utcIsoStringSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    items: z.array(orderItemInputSchema),
    fulfillment: directFulfillmentInputSchema,
  })
  .strict();

const controlCanonicalCustomerReferenceSchema = z
  .object({
    resolution: z.literal('resolved'),
    userId: z.uuid(),
  })
  .strict();

/**
 * Control is first-party order entry. A canonical customer must therefore be
 * selected explicitly instead of creating an unidentified Order that would
 * need fuzzy reconciliation later.
 */
export const controlCreateOrderRequestSchema = createOrderRequestSchema
  .safeExtend({ customer: controlCanonicalCustomerReferenceSchema })
  .strict();

export const correctOrderRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    reasonCode: z.enum([
      'customer_correction',
      'manager_correction',
      'source_discrepancy',
    ]),
    reasonNote: reasonNoteSchema,
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    changes: z
      .object({
        customer: directOrderCustomerSchema.optional(),
        displayNumber: z.string().min(1).nullable().optional(),
        dueAt: utcIsoStringSchema.optional(),
        currency: z
          .string()
          .regex(/^[A-Z]{3}$/)
          .optional(),
        totalAmountCents: z.number().int().nonnegative().optional(),
        balanceDueCents: z.number().int().nonnegative().nullable().optional(),
        items: z.array(orderItemInputSchema).optional(),
        fulfillment: z
          .object({
            typeCode: z.string().min(1).optional(),
            locationId: z.string().min(1).optional(),
            estimatedWeight: z
              .object({
                lbs: z.number().positive().nullable(),
                source: z.string().min(1).nullable(),
              })
              .strict()
              .refine(
                (value) => (value.lbs === null) === (value.source === null),
                {
                  message:
                    'Weight and provenance must either both exist or both be null.',
                },
              )
              .optional(),
          })
          .strict()
          .refine((value) => Object.keys(value).length > 0, {
            message: 'At least one fulfillment description is required.',
          })
          .optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one descriptive correction is required.',
      }),
  })
  .strict();

export const controlCorrectOrderRequestSchema = correctOrderRequestSchema
  .safeExtend({
    changes: correctOrderRequestSchema.shape.changes
      .safeExtend({
        customer: controlCanonicalCustomerReferenceSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const completeOrderRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum(['service_completed', 'manager_correction']),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const cancelOrderRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedVersion: z.number().int().positive(),
    reasonCode: z.enum([
      'customer_canceled',
      'duplicate_order',
      'created_in_error',
      'manager_correction',
    ]),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const releaseFulfillmentRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    reasonCode: z.enum(['ready_for_production', 'manager_override']),
    reasonNote: reasonNoteSchema,
  })
  .strict();

export const withdrawFulfillmentRequestSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    expectedOrderVersion: z.number().int().positive(),
    expectedFulfillmentVersion: z.number().int().positive(),
    reasonCode: z.enum([
      'commercial_canceled',
      'production_hold',
      'manager_override',
    ]),
    reasonNote: reasonNoteSchema,
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

export const controlOrderListQuerySchema = z
  .object({
    query: z.string().trim().max(120).optional(),
    state: z.enum(['open', 'completed', 'canceled']).optional(),
    locationId: z.string().trim().min(1).max(200).optional(),
    cursor: z.string().trim().min(1).max(1_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

const controlOrderCustomerSchema = z
  .object({
    resolution: z.enum([
      'resolved',
      'not_provided',
      'pending',
      'conflict',
      'legacy_unknown',
    ]),
    userId: z.uuid().nullable(),
    displayName: z.string().trim().min(1).nullable(),
    phone: z.string().trim().min(1).nullable(),
    email: z.email().nullable(),
  })
  .strict();

const controlOrderFulfillmentSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    typeCode: z.string().trim().min(1),
    locationId: z.string().trim().min(1),
    releaseState: z.enum(['unreleased', 'released', 'withdrawn']),
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().trim().min(1).nullable(),
    bagCount: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const controlOrderSchema = z
  .object({
    id: z.uuid(),
    version: z.number().int().positive(),
    displayNumber: z.string().trim().min(1).nullable(),
    state: z.enum(['open', 'completed', 'canceled']),
    dueAt: utcIsoStringSchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    customer: controlOrderCustomerSchema,
    fulfillment: controlOrderFulfillmentSchema,
    createdAt: utcIsoStringSchema,
    updatedAt: utcIsoStringSchema,
  })
  .strict();

export const controlOrderDetailSchema = controlOrderSchema
  .extend({ items: z.array(orderItemInputSchema) })
  .strict();

export const controlOrderListSchema = z
  .object({
    items: z.array(controlOrderSchema),
    nextCursor: z.string().trim().min(1).nullable(),
  })
  .strict();

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
export type ControlCreateOrderRequest = z.infer<
  typeof controlCreateOrderRequestSchema
>;
export type IncomingOrderProposalState = z.infer<
  typeof incomingOrderProposalStateSchema
>;
export type IncomingOrderProposalAction = z.infer<
  typeof incomingOrderProposalActionSchema
>;
export type IncomingOrderProposal = z.infer<typeof incomingOrderProposalSchema>;
export type IncomingOrderProposalListQuery = z.infer<
  typeof incomingOrderProposalListQuerySchema
>;
export type IncomingOrderProposalList = z.infer<
  typeof incomingOrderProposalListSchema
>;
export type IncomingOrderProposalParams = z.infer<
  typeof incomingOrderProposalParamsSchema
>;
export type AcceptIncomingOrderProposalRequest = z.infer<
  typeof acceptIncomingOrderProposalRequestSchema
>;
export type RejectIncomingOrderProposalRequest = z.infer<
  typeof rejectIncomingOrderProposalRequestSchema
>;
export type RestoreIncomingOrderProposalRequest = z.infer<
  typeof restoreIncomingOrderProposalRequestSchema
>;
export type IncomingOrderProposalDecisionResult = z.infer<
  typeof incomingOrderProposalDecisionResultSchema
>;
export type RestoreIncomingOrderProposalResult = z.infer<
  typeof restoreIncomingOrderProposalResultSchema
>;
export type CorrectOrderRequest = z.infer<typeof correctOrderRequestSchema>;
export type ControlCorrectOrderRequest = z.infer<
  typeof controlCorrectOrderRequestSchema
>;
export type CompleteOrderRequest = z.infer<typeof completeOrderRequestSchema>;
export type CancelOrderRequest = z.infer<typeof cancelOrderRequestSchema>;
export type ReleaseFulfillmentRequest = z.infer<
  typeof releaseFulfillmentRequestSchema
>;
export type WithdrawFulfillmentRequest = z.infer<
  typeof withdrawFulfillmentRequestSchema
>;
export type OrderMutationResult = z.infer<typeof orderMutationResultSchema>;
export type ControlOrder = z.infer<typeof controlOrderSchema>;
export type ControlOrderDetail = z.infer<typeof controlOrderDetailSchema>;
export type ControlOrderList = z.infer<typeof controlOrderListSchema>;
export type ControlOrderListQuery = z.infer<typeof controlOrderListQuerySchema>;
