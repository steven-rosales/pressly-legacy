import { z } from 'zod';
import {
  listProductionOrderControlResultSchema,
  productionOrderControlItemSchema,
} from '../production/production-order-control.contracts.ts';

export const processorCustomerResolutionSchema = z.enum([
  'resolved',
  'not_provided',
  'pending',
  'conflict',
  'legacy_unknown',
]);

export const processorSourceComparisonSchema = z.enum([
  'aligned',
  'source_ahead',
  'source_withdrawn',
  'source_behind',
  'unavailable',
]);

export const processorOrderContextSchema = z
  .object({
    canonicalOrderId: z.string().uuid(),
    canonicalFulfillmentId: z.string().uuid(),
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
        status: z.string().min(1).nullable(),
      })
      .strict()
      .nullable(),
    comparison: processorSourceComparisonSchema,
  })
  .strict();

export const processorOrderControlItemSchema = productionOrderControlItemSchema
  .extend({ canonical: processorOrderContextSchema.nullable() })
  .strict();

export const listProcessorOrderControlResultSchema =
  listProductionOrderControlResultSchema
    .extend({ items: z.array(processorOrderControlItemSchema) })
    .strict();

export type ProcessorOrderContext = z.infer<typeof processorOrderContextSchema>;
export type ProcessorOrderControlItem = z.infer<
  typeof processorOrderControlItemSchema
>;
export type ListProcessorOrderControlResult = z.infer<
  typeof listProcessorOrderControlResultSchema
>;
