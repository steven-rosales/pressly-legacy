import 'server-only';

import { cache } from 'react';
import type { PricingServiceSlug } from '@pressly/contracts/pricing';

import { makeServerWebCore } from '@/common/adapters/runtime/server-web-core';
import type { PricingCatalogLoader } from './model';
import { loadPricingCatalogViewModel, makePricingQueries } from './queries';

const pricingCore = makeServerWebCore({ route: 'server:pricing' });
const pricingQueries = makePricingQueries(pricingCore.query);

const loadCachedPricingCatalog = cache(
  async (serviceSlug: PricingServiceSlug) => {
    return loadPricingCatalogViewModel(
      pricingQueries,
      { serviceSlug },
      { staticOnly: process.env['PRESSLY_DOCKER_BUILD'] === 'true' },
    );
  },
);

export const serverPricingCatalogLoader: PricingCatalogLoader = Object.freeze(
  (input) => loadCachedPricingCatalog(input.serviceSlug),
);
