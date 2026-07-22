import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const fulfillmentDemandChangedEventType =
  'fulfillment_demand_changed' as const;

export const fulfillmentDemandChangedEventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventType: z.literal(fulfillmentDemandChangedEventType),
    fulfillmentId: z.string().uuid(),
    displayNumber: z.string().min(1).nullable(),
    locationId: z.string().min(1),
    typeCode: z.string().min(1),
    admissionState: z.enum(['unreleased', 'released', 'withdrawn']),
    commercialState: z.enum(['open', 'completed', 'canceled']),
    dueAt: utcIsoStringSchema,
    estimatedWeightLbs: z.number().positive().nullable(),
    estimatedWeightSource: z.string().min(1).nullable(),
    bagCount: z.number().int().nonnegative().nullable(),
    version: z.number().int().positive(),
    observedAt: utcIsoStringSchema,
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

export type FulfillmentDemandChangedEvent = z.infer<
  typeof fulfillmentDemandChangedEventSchema
>;
