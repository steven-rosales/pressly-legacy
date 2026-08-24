import type { AppError } from '@pressly/errors/app-error';
import {
  type PricingCatalogHttpParams as PricingParamsRequestSchema,
  type PricingCatalogHttpResult as PricingCatalogResult,
} from '@pressly/pricing-system/http/catalog';
import type { CustomerPricingBrowserClient } from '../../../browser/pricing/types.ts';
import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';

import type { QueryRuntime } from '#customer/actions/query';
import type { PricingCatalogViewModel } from './model';
import { buildStaticCatalog, hasRequiredPricing } from './static-catalog';

export type PricingQueries = Readonly<{
  loadCatalog: (
    input: PricingParamsRequestSchema,
  ) => Promise<Result<PricingCatalogResult, AppError>>;
}>;

export const makePricingQueries = (
  dependencies: Readonly<{
    query: Pick<QueryRuntime, 'run'>;
    pricing: Pick<CustomerPricingBrowserClient, 'loadCatalog'>;
  }>,
): PricingQueries =>
  Object.freeze({
    loadCatalog: (query) =>
      dependencies.query.run({
        meta: {
          action: 'load_pricing_catalog',
          rail: 'query',
          criticality: 'low',
          source: 'pricing',
        },
        work: () => dependencies.pricing.loadCatalog(query.serviceSlug),
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
