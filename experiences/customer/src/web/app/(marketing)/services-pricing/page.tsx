import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { buildPageMetadata } from '#customer/app/_lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Services & Pricing',
  description:
    'Review Pressly wash and fold laundry and dry cleaning pricing before scheduling pickup and delivery.',
  path: '/services-pricing',
});

export default function ServicesPricingIndexPage() {
  redirect('/services-pricing/wash-fold');
}
