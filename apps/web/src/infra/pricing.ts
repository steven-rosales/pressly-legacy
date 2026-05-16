import 'server-only';

import type { AppError, Result } from '@pressly/errors';
import {
  pricingCatalogSchema,
  type PricingCatalogResult,
  type PricingParamsRequestSchema,
} from '@pressly/contracts';
import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';

const toPricingPath = (input: PricingParamsRequestSchema): string =>
  input.locationSlug === undefined
    ? `/pricing/services/${input.serviceSlug}/pricing`
    : `/pricing/locations/${input.locationSlug}/services/${input.serviceSlug}/pricing`;

const pricingCore = makeServerWebCore({ route: 'server:pricing' });

export async function loadPricingCatalog(
  input: PricingParamsRequestSchema,
): Promise<Result<PricingCatalogResult, AppError>> {
  return pricingCore.query.fetch({
    meta: {
      action: 'load_pricing_catalog',
      rail: 'query',
      criticality: 'low',
      source: 'pricing',
    },
    request: {
      method: 'GET',
      path: toPricingPath(input),
      response: pricingCatalogSchema,
      next: { revalidate: 3600, tags: ['pricing'] },
    },
  });
}
