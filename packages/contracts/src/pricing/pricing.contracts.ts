import { z } from 'zod';
import { utcIsoStringSchema } from '../common/utc-iso.contracts.ts';

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
  locationSlug: z.string().optional(),
  currency: z.string(),
  items: z.array(pricingItemSchema),
  updatedAt: utcIsoStringSchema,
});

export const loadPricingCatalogCommandSchema = z.object({
  serviceSlug: pricingServiceSlugSchema,
  locationSlug: z.string().min(1).optional(),
});

export const pricingParamsRequestSchema = loadPricingCatalogCommandSchema;

export const publishPricingChangeItemSchema = z
  .object({
    code: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
  })
  .strict();

export const pricingChangeRequestSchema = z
  .object({
    serviceSlug: pricingServiceSlugSchema,
    locationSlug: z.string().min(1).optional(),
    reason: z.string().min(1),
    items: z.array(publishPricingChangeItemSchema).min(1),
  })
  .strict();
