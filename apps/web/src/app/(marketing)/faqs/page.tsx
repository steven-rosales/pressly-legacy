import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { PublicSiteShell } from '@/app/shared/ui/public/PublicSiteShell';
import { getFaqsPageModel } from './model';
import { FaqsPageView } from './ui/FaqsPageView';

export const metadata: Metadata = buildPageMetadata({
  title: 'FAQs',
  description: 'Answers to common Pressly pickup and delivery questions.',
  path: '/faqs',
});

export default function FaqsPage() {
  return (
    <PublicSiteShell>
      <FaqsPageView model={getFaqsPageModel()} />
    </PublicSiteShell>
  );
}
