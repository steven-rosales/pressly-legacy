import type { Metadata } from 'next';

import { buildPageMetadata } from '#customer/app/_lib/seo/metadata';
import type { PricingCatalogLoader } from '#customer/features/pricing/model';
import { getDryCleaningServicePricingPageModel } from '../model';
import ServicePricingPageView from '../ui/ServicePricingPageView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Dry Cleaning Pickup and Delivery Pricing',
  description:
    'See Pressly dry cleaning pricing, pickup details, garment categories, minimums, and delivery information for New Jersey service areas.',
  path: '/services-pricing/dry-cleaning',
  image: '/graphic-img/dry-cleaning.webp',
});

export async function renderDryCleaningPage(
  pricingCatalog: PricingCatalogLoader,
) {
  const model = await getDryCleaningServicePricingPageModel(pricingCatalog);

  return <ServicePricingPageView model={model} />;
}
