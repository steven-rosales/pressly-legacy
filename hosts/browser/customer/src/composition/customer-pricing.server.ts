import 'server-only';

import {
  makeCustomerPricingCatalogLoader,
  type PricingCatalogLoader,
} from '@pressly/topology/browser/customer';
import { cache } from 'react';
import { makeServerWebCore } from './server-web-core';

const pricingCore = makeServerWebCore({ route: 'server:pricing' });
const pricingCatalog = makeCustomerPricingCatalogLoader({
  core: pricingCore,
  staticOnly: process.env['PRESSLY_DOCKER_BUILD'] === 'true',
  next: { revalidate: 3600, tags: ['pricing'] },
});

const loadCachedPricingCatalog = cache(pricingCatalog);

export const serverPricingCatalogLoader: PricingCatalogLoader = Object.freeze(
  (input: Parameters<typeof pricingCatalog>[0]) =>
    loadCachedPricingCatalog(input),
);
