import type { Result } from '@pressly/kernel';
import 'server-only';

import type { AppError } from '@pressly/errors';
import {
  pricingCatalogSchema,
  type PricingCatalogResult,
  type PricingParamsRequestSchema,
} from '@pressly/contracts';
import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';

const toPricingPath = (input: PricingParamsRequestSchema): string =>
  `/pricing/services/${input.serviceSlug}/pricing`;

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
