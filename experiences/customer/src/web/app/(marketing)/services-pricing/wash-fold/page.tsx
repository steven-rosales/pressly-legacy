import type { Metadata } from 'next';

import { buildPageMetadata } from '#customer/app/_lib/seo/metadata';
import type { PricingCatalogLoader } from '#customer/features/pricing/model';
import { getWashFoldServicePricingPageModel } from '../model';
import ServicePricingPageView from '../ui/ServicePricingPageView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Wash & Fold Laundry Service Pricing',
  description:
    'See Pressly wash and fold laundry pricing, pickup details, specialty item pricing, minimums, and delivery information for New Jersey service areas.',
  path: '/services-pricing/wash-fold',
  image: '/graphic-img/wash-fold.webp',
});

export async function renderWashFoldPage(pricingCatalog: PricingCatalogLoader) {
  const model = await getWashFoldServicePricingPageModel(pricingCatalog);

  return <ServicePricingPageView model={model} />;
}
