import type { z } from 'zod';
import {
  pricingCatalogHttpResultSchema,
  pricingParamsSchema,
  pricingServiceSlugSchema,
} from '../cells/catalog/load-pricing-catalog/contract.ts';

export {
  pricingCatalogHttpResultSchema,
  pricingParamsSchema,
  pricingServiceSlugSchema,
};

export type PricingCatalogHttpResult = z.output<
  typeof pricingCatalogHttpResultSchema
>;
export type PricingCatalogHttpItem = PricingCatalogHttpResult['items'][number];
export type PricingCatalogHttpParams = z.output<typeof pricingParamsSchema>;
export type PricingServiceSlug = z.output<typeof pricingServiceSlugSchema>;
