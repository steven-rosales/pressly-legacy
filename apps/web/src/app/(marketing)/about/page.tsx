import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { PublicSiteShell } from '@/app/shared/ui/public/PublicSiteShell';
import { getAboutPageModel } from './model';
import { AboutPageView } from './ui/AboutPageView';

export const metadata: Metadata = buildPageMetadata({
  title: 'About Pressly',
  description:
    'Learn about Pressly laundry and dry cleaning pickup and delivery.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <PublicSiteShell>
      <AboutPageView model={getAboutPageModel()} />
    </PublicSiteShell>
  );
}
