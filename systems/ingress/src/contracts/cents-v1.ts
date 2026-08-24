import { sha256HexSchema } from '@pressly/codec/sha256';
import { utcIsoStringSchema } from '@pressly/codec/utc-iso';
import { z } from 'zod';

export const centsOrderWebhookEventKindSchema = z.enum([
  'order_created',
  'order_updated',
  'order_completed',
]);

export const centsWireIdentifierSchema = z.union([
  z.string().trim().min(1),
  z.number().int().nonnegative(),
]);

export const centsWireMoneySchema = z.union([
  z.number().finite().nonnegative(),
  z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?$/),
]);

export const centsOrderServiceWireSchema = z
  .object({
    id: centsWireIdentifierSchema,
    name: z.string().trim().min(1),
    quantity: z.number().finite().nonnegative(),
    totalPrice: centsWireMoneySchema,
    unitPrice: centsWireMoneySchema.optional(),
    unitCost: centsWireMoneySchema.optional(),
    serviceCategory: z.string().trim().min(1).optional(),
    serviceCategoryType: z.string().trim().min(1).optional(),
  })
  .passthrough()
  .superRefine((service, context) => {
    if (service.unitPrice === undefined && service.unitCost === undefined)
      context.addIssue({
        code: 'custom',
        path: ['unitPrice'],
        message: 'unitPrice or unitCost is required.',
      });

    if (
      service.serviceCategory === undefined &&
      service.serviceCategoryType === undefined
    )
      context.addIssue({
        code: 'custom',
        path: ['serviceCategoryType'],
        message: 'serviceCategory or serviceCategoryType is required.',
      });
  });

export const centsOrderIdentityWireSchema = z
  .object({
    id: centsWireIdentifierSchema,
    storeId: centsWireIdentifierSchema,
    status: z.string().trim().min(1),
    updatedAt: utcIsoStringSchema,
  })
  .passthrough();

export const centsOrderWireSchema = centsOrderIdentityWireSchema
  .extend({
    dueDate: utcIsoStringSchema,
    orderCode: z.union([z.string().trim().min(1), z.number()]).optional(),
    orderTotal: centsWireMoneySchema.optional(),
    balanceDue: centsWireMoneySchema.optional(),
    services: z.array(centsOrderServiceWireSchema).optional(),
  })
  .passthrough();

export const centsCustomerWireSchema = z
  .object({
    id: centsWireIdentifierSchema,
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    phoneNumber: z.string().nullable().optional(),
    businessName: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * The public Cents examples alternate between `action` and `event`. The
 * adapter resolves the alias and rejects a conflicting pair.
 */
export const centsWebhookWireEnvelopeSchema = z
  .object({
    action: z.string().trim().min(1).max(200).optional(),
    event: z.string().trim().min(1).max(200).optional(),
  })
  .passthrough()
  .superRefine((envelope, context) => {
    if (envelope.action === undefined && envelope.event === undefined)
      context.addIssue({
        code: 'custom',
        path: ['event'],
        message: 'action or event is required.',
      });
  });

export const centsOrderCandidateServiceSchema = z
  .object({
    externalServiceId: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    quantity: z.number().finite().nonnegative(),
    totalPriceCents: z.number().int().nonnegative(),
    unitPriceCents: z.number().int().positive(),
  })
  .strict();

export const centsOrderCandidateCustomerSchema = z
  .object({
    externalUserId: z.string().min(1),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    businessName: z.string().nullable(),
    email: z.string().nullable(),
  })
  .strict();

export const centsSubmittedOrderCandidatePayloadSchema = z
  .object({
    externalOrderId: z.string().min(1),
    orderCode: z.string().min(1).nullable(),
    externalStoreId: z.string().min(1),
    status: z.literal('SUBMITTED'),
    dueAt: utcIsoStringSchema,
    sourceUpdatedAt: utcIsoStringSchema,
    bagCount: z.null(),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    services: z.array(centsOrderCandidateServiceSchema),
    customer: centsOrderCandidateCustomerSchema.nullable(),
  })
  .strict();

export const centsOrderTerminalClosePayloadSchema = z
  .object({
    externalOrderId: z.string().min(1),
    externalStoreId: z.string().min(1),
    status: z.enum(['COMPLETED', 'CANCELED']),
    sourceUpdatedAt: utcIsoStringSchema,
  })
  .strict();

export const centsIngressReceiptSchema = z
  .object({
    deduplicationKey: sha256HexSchema,
    eventKind: z.string().min(1).max(200),
    classification: z.enum(['order', 'unknown']),
    rawBodySha256: sha256HexSchema,
    sourceUpdatedAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const centsIngressDecisionSchema = z.discriminatedUnion('disposition', [
  z
    .object({
      disposition: z.literal('propose_order_candidate'),
      receipt: centsIngressReceiptSchema.extend({
        classification: z.literal('order'),
        sourceUpdatedAt: utcIsoStringSchema,
      }),
      order: centsSubmittedOrderCandidatePayloadSchema,
    })
    .strict(),
  z
    .object({
      disposition: z.literal('close_order_candidate'),
      receipt: centsIngressReceiptSchema.extend({
        classification: z.literal('order'),
        sourceUpdatedAt: utcIsoStringSchema,
      }),
      order: centsOrderTerminalClosePayloadSchema,
    })
    .strict(),
  z
    .object({
      disposition: z.literal('ignore'),
      receipt: centsIngressReceiptSchema.extend({
        classification: z.literal('unknown'),
      }),
      reason: z.literal('unsupported_event'),
    })
    .strict(),
]);

export type CentsWebhookWireEnvelope = z.infer<
  typeof centsWebhookWireEnvelopeSchema
>;
export type CentsIngressReceipt = z.infer<typeof centsIngressReceiptSchema>;
export type CentsSubmittedOrderCandidatePayload = z.infer<
  typeof centsSubmittedOrderCandidatePayloadSchema
>;
export type CentsOrderTerminalClosePayload = z.infer<
  typeof centsOrderTerminalClosePayloadSchema
>;
export type CentsIngressDecision = z.infer<typeof centsIngressDecisionSchema>;
