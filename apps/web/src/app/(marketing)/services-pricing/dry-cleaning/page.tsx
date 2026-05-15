import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { getDryCleaningServicePricingPageModel } from '../model';
import ServicePricingPageView from '../ui/ServicePricingPageView';

export const revalidate = 3600;

export const metadata: Metadata = buildPageMetadata({
  title: 'Dry Cleaning Pickup and Delivery Pricing',
  description:
    'See Pressly dry cleaning pricing, pickup details, garment categories, minimums, and delivery information for New Jersey service areas.',
  path: '/services-pricing/dry-cleaning',
  image: '/graphic-img/dry-cleaning.webp',
});

export default async function DryCleaningPage() {
  const model = await getDryCleaningServicePricingPageModel();

  return <ServicePricingPageView model={model} />;
}
