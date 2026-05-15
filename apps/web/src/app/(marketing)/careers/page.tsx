import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { PublicSiteShell } from '@/app/shared/ui/public/PublicSiteShell';
import { getCareersPageModel } from './model';
import { CareersPageView } from './ui/CareersPageView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Careers',
  description: 'Careers at Pressly.',
  path: '/careers',
});

export default function CareersPage() {
  return (
    <PublicSiteShell>
      <CareersPageView model={getCareersPageModel()} />
    </PublicSiteShell>
  );
}
