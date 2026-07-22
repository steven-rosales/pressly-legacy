import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

import { sha256HexSchema } from '../webhook-ingestion/webhook-ingestion.contracts.ts';

export const centsOrderWebhookEventKindSchema = z.enum([
  'order_created',
  'order_updated',
  'order_completed',
]);

export const centsCustomerWebhookEventKindSchema = z.enum([
  'customer_created',
  'customer_updated',
]);

export const centsMarketingWebhookEventKindSchema = z.literal(
  'customer_marketing_optin',
);

export const centsWebhookEventKindSchema = z.union([
  centsOrderWebhookEventKindSchema,
  centsCustomerWebhookEventKindSchema,
  centsMarketingWebhookEventKindSchema,
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

export const centsWireOrderStatusSchema = z.enum([
  'SUBMITTED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_PROGRESS',
  'READY_FOR_RETURN',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELLED',
  'CANCELED',
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

export const centsOrderWireSchema = z
  .object({
    id: centsWireIdentifierSchema,
    storeId: centsWireIdentifierSchema,
    status: centsWireOrderStatusSchema,
    dueDate: utcIsoStringSchema,
    updatedAt: utcIsoStringSchema,
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
    isCommercial: z.boolean().optional(),
    isInvoicingEnabled: z.boolean().optional(),
    centsCustomerId: centsWireIdentifierSchema.optional(),
    referralCode: z.string().nullable().optional(),
    updatedAt: utcIsoStringSchema.optional(),
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

export const centsOrderStatusSchema = z.enum([
  'SUBMITTED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_PROGRESS',
  'READY_FOR_RETURN',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'CANCELED',
]);

export const centsCanonicalOrderServiceSchema = z
  .object({
    externalServiceId: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    quantity: z.number().finite().nonnegative(),
    totalPriceCents: z.number().int().nonnegative(),
    unitPriceCents: z.number().int().positive(),
    sourceMetadata: z.json(),
  })
  .strict();

export const centsCanonicalCustomerInputSchema = z
  .object({
    externalUserId: z.string().min(1),
    centsCustomerId: z.string().min(1).nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    businessName: z.string().nullable(),
    email: z.string().nullable(),
    isCommercial: z.boolean().nullable(),
    isInvoicingEnabled: z.boolean().nullable(),
    referralCode: z.string().nullable(),
    sourceUpdatedAt: utcIsoStringSchema.nullable(),
    sourceSnapshot: z.json(),
  })
  .strict();

export const centsCanonicalOrderInputSchema = z
  .object({
    externalOrderId: z.string().min(1),
    orderCode: z.string().min(1).nullable(),
    externalStoreId: z.string().min(1),
    status: centsOrderStatusSchema,
    dueAt: utcIsoStringSchema,
    sourceUpdatedAt: utcIsoStringSchema,
    bagCount: z.null(),
    totalAmountCents: z.number().int().nonnegative(),
    balanceDueCents: z.number().int().nonnegative().nullable(),
    services: z.array(centsCanonicalOrderServiceSchema),
    customer: centsCanonicalCustomerInputSchema.nullable(),
    sourceSnapshot: z.json(),
  })
  .strict();

export const centsCanonicalMarketingInputSchema = z
  .object({
    customer: centsCanonicalCustomerInputSchema,
    granted: z.literal(true),
    sourceSnapshot: z.json(),
  })
  .strict();

export const centsIngressReceiptSchema = z
  .object({
    deduplicationKey: sha256HexSchema,
    eventKind: z.string().min(1).max(200),
    classification: z.enum(['order', 'customer', 'marketing', 'unknown']),
    rawBodySha256: sha256HexSchema,
    sourceUpdatedAt: utcIsoStringSchema.nullable(),
  })
  .strict();

export const centsIngressDecisionSchema = z.discriminatedUnion('disposition', [
  z
    .object({
      disposition: z.literal('project_order'),
      receipt: centsIngressReceiptSchema.extend({
        classification: z.literal('order'),
        sourceUpdatedAt: utcIsoStringSchema,
      }),
      order: centsCanonicalOrderInputSchema,
    })
    .strict(),
  z
    .object({
      disposition: z.literal('project_customer'),
      receipt: centsIngressReceiptSchema.extend({
        classification: z.literal('customer'),
      }),
      customer: centsCanonicalCustomerInputSchema,
    })
    .strict(),
  z
    .object({
      disposition: z.literal('record_marketing'),
      receipt: centsIngressReceiptSchema.extend({
        classification: z.literal('marketing'),
      }),
      marketing: centsCanonicalMarketingInputSchema,
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
