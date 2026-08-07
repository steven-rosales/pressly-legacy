import { z } from 'zod';
import { utcIsoStringSchema } from '../utc-iso.contracts.ts';

export const pricingServiceSlugSchema = z.enum(['wash-fold', 'dry-cleaning']);

export const pricingItemMetadataSchema = z
  .object({
    minimumThresholdQuantity: z.number().optional(),
    displayUnitLabel: z.string().optional(),
  })
  .default({});

export const pricingItemSchema = z.object({
  service: z.string(),
  unit: z.string(),
  category: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  sortOrder: z.number().int(),
  metadata: pricingItemMetadataSchema,
});

export const pricingCatalogSchema = z.object({
  serviceSlug: pricingServiceSlugSchema,
  currency: z.string(),
  items: z.array(pricingItemSchema),
  updatedAt: utcIsoStringSchema,
});

export const pricingParamsRequestSchema = z.object({
  serviceSlug: pricingServiceSlugSchema,
});

/** @deprecated Use pricingParamsRequestSchema for serialized route parameters. */
export const loadPricingCatalogCommandSchema = pricingParamsRequestSchema;

export const publishPricingChangeItemSchema = z
  .object({
    code: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
  })
  .strict();

export const pricingChangeRequestSchema = z
  .object({
    serviceSlug: pricingServiceSlugSchema,
    reason: z.string().min(1),
    items: z.array(publishPricingChangeItemSchema).min(1),
  })
  .strict();

export const pricingChangeDiffItemSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    oldPriceCents: z.number().int().nonnegative(),
    newPriceCents: z.number().int().nonnegative(),
  })
  .strict();

export const pricingChangePlanSchema = z
  .object({
    serviceSlug: pricingServiceSlugSchema,
    reason: z.string().min(1),
    oldPricingSetId: z.string().min(1),
    currency: z.string().min(1),
    changes: z.array(pricingChangeDiffItemSchema),
  })
  .strict();

export const publishPricingChangeResultSchema = z
  .object({
    oldPricingSetId: z.string().min(1),
    newPricingSetId: z.string().min(1),
    auditEventId: z.string().min(1),
    changeItemCount: z.number().int().nonnegative(),
  })
  .strict();
