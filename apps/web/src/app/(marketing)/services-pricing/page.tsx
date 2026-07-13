import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/_lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Services & Pricing',
  description:
    'Review Pressly wash and fold laundry and dry cleaning pricing before scheduling pickup and delivery.',
  path: '/services-pricing',
});

export default function ServicesPricingIndexPage() {
  redirect('/services-pricing/wash-fold');
}
