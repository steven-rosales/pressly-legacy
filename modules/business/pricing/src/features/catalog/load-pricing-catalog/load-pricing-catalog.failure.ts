import type { PricingServiceSlug } from '../../../foundations/language/pricing/pricing.value.ts';

export type LoadPricingCatalogFailure = Readonly<{
  code: 'pricing_not_found';
  serviceSlug: PricingServiceSlug;
  missing: 'service' | 'active-pricing-set';
}>;
