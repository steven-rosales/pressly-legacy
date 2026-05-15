import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { getWashFoldServicePricingPageModel } from '../model';
import ServicePricingPageView from '../ui/ServicePricingPageView';

export const revalidate = 3600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Wash & Fold Laundry Service Pricing',
  description:
    'See Pressly wash and fold laundry pricing, pickup details, specialty item pricing, minimums, and delivery information for New Jersey service areas.',
  path: '/services-pricing/wash-fold',
  image: '/graphic-img/wash-fold.webp',
});

export default async function WashFoldPage() {
  const model = await getWashFoldServicePricingPageModel();

  return <ServicePricingPageView model={model} />;
}
