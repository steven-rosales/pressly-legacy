import type { z } from 'zod';
import type {
  pricingCatalogSchema,
  pricingItemSchema,
  pricingServiceSlugSchema,
} from './pricing.contracts.js';

export type PricingServiceSlug = z.infer<typeof pricingServiceSlugSchema>;

export type PricingItemResult = z.infer<typeof pricingItemSchema>;

export type PricingCatalogResult = z.infer<typeof pricingCatalogSchema>;

export type PricingChangeDiffItem = Readonly<{
  code: string;
  name: string;
  oldPriceCents: number;
  newPriceCents: number;
}>;

export type PricingChangePlan = Readonly<{
  serviceSlug: PricingServiceSlug;
  locationSlug?: string;
  reason: string;
  oldPricingSetId: string;
  currency: string;
  changes: readonly PricingChangeDiffItem[];
}>;

export type LoadPricingCatalogResult = PricingCatalogResult;

export type PublishPricingChangeResult = Readonly<{
  oldPricingSetId: string;
  newPricingSetId: string;
  auditEventId: string;
  changeItemCount: number;
}>;
