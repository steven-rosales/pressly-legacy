import type { Metadata } from 'next';
import { buildPageMetadata } from '@/app/_lib/seo';
import { getCommercialPageModel } from './model';
import CommercialContactSection from './ui/CommercialContactSection';

export const metadata: Metadata = buildPageMetadata({
  title: 'Commercial Laundry and Dry Cleaning Service',
  description:
    'Commercial laundry and dry cleaning pickup and delivery for New Jersey businesses, offices, salons, gyms, hospitality teams, and local operators.',
  path: '/commercial',
});

export default function CommercialPage() {
  return (
    <section className="mx-auto max-w-360 px-4 pt-12 pb-22 sm:px-6 lg:py-20">
      <CommercialContactSection model={getCommercialPageModel()} />
    </section>
  );
}
