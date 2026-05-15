import type { Metadata } from 'next';

import { DELIVERY_FEE_SHORT_COPY } from '@/app/shared/marketing/content';
import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { PublicSiteShell } from '@/app/shared/ui/public/PublicSiteShell';
import { getHomePageModel } from './home/model';
import HomePageView from './home/ui/HomePageView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Laundry & Dry Cleaning Pickup and Delivery',
  description: `Pressly offers wash and fold laundry and dry cleaning pickup and delivery in New Jersey with clear pricing, a ${DELIVERY_FEE_SHORT_COPY}, and online scheduling.`,
  path: '/',
});

export default function HomePage() {
  return (
    <PublicSiteShell mainClassName="bg-background">
      <HomePageView model={getHomePageModel()} />
    </PublicSiteShell>
  );
}
