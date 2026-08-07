import type { z } from 'zod';
import type {
  pricingChangeDiffItemSchema,
  pricingChangePlanSchema,
  pricingCatalogSchema,
  pricingItemSchema,
  pricingServiceSlugSchema,
  publishPricingChangeResultSchema,
} from './pricing.contracts.js';

export type PricingServiceSlug = z.infer<typeof pricingServiceSlugSchema>;

export type PricingItemResult = z.infer<typeof pricingItemSchema>;

export type PricingCatalogResult = z.infer<typeof pricingCatalogSchema>;

export type PricingChangeDiffItem = z.infer<typeof pricingChangeDiffItemSchema>;

export type PricingChangePlan = z.infer<typeof pricingChangePlanSchema>;

export type LoadPricingCatalogResult = PricingCatalogResult;

export type PublishPricingChangeResult = z.infer<
  typeof publishPricingChangeResultSchema
>;
