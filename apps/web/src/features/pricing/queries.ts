import type { AppError } from '@pressly/errors/app-error';
import {
  pricingCatalogSchema,
  type PricingCatalogResult,
  type PricingParamsRequestSchema,
} from '@pressly/contracts/pricing';
import { result, type Result } from '@pressly/kernel';

import type { QueryRuntime } from '@/common/core/actions/query';
import type { PricingCatalogViewModel } from './model';
import { buildStaticCatalog, hasRequiredPricing } from './static-catalog';

export type PricingQueries = Readonly<{
  loadCatalog: (
    input: PricingParamsRequestSchema,
  ) => Promise<Result<PricingCatalogResult, AppError>>;
}>;

export const makePricingQueries = (
  query: Pick<QueryRuntime, 'fetch'>,
): PricingQueries =>
  Object.freeze({
    loadCatalog: (input) =>
      query.fetch({
        meta: {
          action: 'load_pricing_catalog',
          rail: 'query',
          criticality: 'low',
          source: 'pricing',
        },
        request: {
          method: 'GET',
          path: `/pricing/services/${input.serviceSlug}/pricing`,
          response: pricingCatalogSchema,
          next: { revalidate: 3600, tags: ['pricing'] },
        },
      }),
  });

export async function loadPricingCatalogViewModel(
  queries: PricingQueries,
  input: PricingParamsRequestSchema,
  options: Readonly<{ staticOnly?: boolean }> = {},
): Promise<PricingCatalogViewModel> {
  if (options.staticOnly === true)
    return {
      source: 'static-fallback',
      catalog: buildStaticCatalog(input.serviceSlug),
    };

  const pricing = await queries.loadCatalog(input);

  if (result.isOk(pricing) && hasRequiredPricing(pricing.value))
    return { source: 'api', catalog: pricing.value };

  return {
    source: 'static-fallback',
    catalog: buildStaticCatalog(input.serviceSlug),
  };
}
