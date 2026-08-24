import type {
  PricingCatalog,
  PricingServiceSlug,
} from '../../../model/pricing.ts';

export const loadPricingCatalogOperationId =
  'pricing.load-pricing-catalog.v1' as const;

export type LoadPricingCatalogQuery = Readonly<{
  serviceSlug: PricingServiceSlug;
}>;

export type LoadPricingCatalogExpectedFailure = Readonly<{
  code: 'pricing_not_found';
  serviceSlug: PricingServiceSlug;
  missing: 'service' | 'active-pricing-set';
}>;

export type LoadPricingCatalogRepository = (
  query: LoadPricingCatalogQuery,
) => Promise<
  | Readonly<{ kind: 'found'; catalog: PricingCatalog }>
  | Readonly<{ kind: 'missing'; missing: 'service' | 'active-pricing-set' }>
>;
