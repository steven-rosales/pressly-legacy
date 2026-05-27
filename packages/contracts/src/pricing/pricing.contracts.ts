import { z } from 'zod';

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
  updatedAt: z.string(),
});

export const loadPricingCatalogCommandSchema = z.object({
  serviceSlug: pricingServiceSlugSchema,
  locationSlug: z.string().min(1).optional(),
});

export const pricingParamsRequestSchema = loadPricingCatalogCommandSchema;

export const publishPricingChangeActorSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(['human', 'service']),
    displayName: z.string().min(1),
    role: z.enum([
      'owner',
      'admin',
      'operator',
      'customer',
      'driver',
      'service',
      'developer',
      'ci',
    ]),
  })
  .strict();

export const publishPricingChangeItemSchema = z
  .object({
    code: z.string().min(1),
    priceCents: z.number().int().nonnegative(),
  })
  .strict();

export const publishPricingChangeCommandSchema = z
  .object({
    serviceSlug: pricingServiceSlugSchema,
    locationSlug: z.string().min(1).optional(),
    reason: z.string().min(1),
    actor: publishPricingChangeActorSchema,
    items: z.array(publishPricingChangeItemSchema).min(1),
  })
  .strict();
