import { z } from 'zod';

export const pricingServiceSlugSchema = z.enum(['wash-fold', 'dry-cleaning']);

export type PricingServiceSlug = z.infer<typeof pricingServiceSlugSchema>;

export const pricingItemSchema = z.object({
  service: z.string(),
  unit: z.string(),
  category: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  sortOrder: z.number().int(),
  metadata: z
    .object({
      minimumThresholdQuantity: z.number().optional(),
      displayUnitLabel: z.string().optional(),
    })
    .default({}),
});

export type PricingItemDto = z.infer<typeof pricingItemSchema>;

export const pricingCatalogSchema = z.object({
  serviceSlug: pricingServiceSlugSchema,
  locationSlug: z.string().optional(),
  currency: z.string(),
  items: z.array(pricingItemSchema),
  updatedAt: z.string(),
});

export type PricingCatalogDto = z.infer<typeof pricingCatalogSchema>;

export const pricingParamsRequestSchema = z.object({
  serviceSlug: pricingServiceSlugSchema,
  locationSlug: z.string().min(1).optional(),
});

export type PricingParamsRequestSchema = z.infer<
  typeof pricingParamsRequestSchema
>;
