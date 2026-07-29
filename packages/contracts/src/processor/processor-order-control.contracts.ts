import { z } from 'zod';
import {
  listProductionOrderControlResultSchema,
  productionOrderControlItemSchema,
} from '../production/production-order-control.contracts.ts';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';
import { processorOperationalOrderIdentitySchema } from './processor-operational-order-identity.contracts.ts';

export const processorCustomerResolutionSchema = z.enum([
  'resolved',
  'not_provided',
  'pending',
  'conflict',
  'legacy_unknown',
]);

export const processorOrderAuditEntrySchema = z
  .object({
    kind: z.enum(['source_observation', 'order_command', 'production_command']),
    code: z.string().min(1),
    occurredAt: utcIsoStringSchema,
    actor: z.string().min(1),
    outcome: z.string().min(1).nullable(),
  })
  .strict();

export const processorOrderContextSchema = z
  .object({
    canonicalOrderId: z.string().uuid(),
    canonicalFulfillmentId: z.string().uuid(),
    versions: z
      .object({
        order: z.number().int().positive(),
        fulfillment: z.number().int().positive(),
      })
      .strict(),
    displayNumber: z.string().min(1).nullable(),
    customer: z
      .object({
        resolution: processorCustomerResolutionSchema,
        userId: z.string().uuid().nullable(),
        firstName: z.string().nullable(),
        lastName: z.string().nullable(),
        businessName: z.string().nullable(),
        phone: z.string().nullable(),
      })
      .strict(),
    commercialState: z.enum(['open', 'completed', 'canceled']),
    admissionState: z.enum(['unreleased', 'released', 'withdrawn']),
    source: z
      .object({
        name: z.string().min(1),
      })
      .strict()
      .nullable(),
    audit: z.array(processorOrderAuditEntrySchema).max(8),
  })
  .strict();

export const processorOrderControlItemSchema = productionOrderControlItemSchema
  .extend({
    identity: processorOperationalOrderIdentitySchema,
    canonical: processorOrderContextSchema.nullable(),
  })
  .strict();

export const listProcessorOrderControlResultSchema =
  listProductionOrderControlResultSchema
    .extend({ items: z.array(processorOrderControlItemSchema) })
    .strict();

export type ProcessorOrderContext = z.infer<typeof processorOrderContextSchema>;
export type ProcessorOrderAuditEntry = z.infer<
  typeof processorOrderAuditEntrySchema
>;
export type ProcessorOrderControlItem = z.infer<
  typeof processorOrderControlItemSchema
>;
export type ListProcessorOrderControlResult = z.infer<
  typeof listProcessorOrderControlResultSchema
>;
