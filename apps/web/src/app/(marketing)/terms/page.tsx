import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { getTermsOfServiceModel } from '@/app/shared/legal/model';
import { LegalDocumentView } from '@/app/shared/legal/ui/LegalDocumentView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Terms of Service',
  description:
    'Read the Pressly terms of service for laundry and dry cleaning pickup and delivery.',
  path: '/terms',
});

export default function TermsOfServicePage() {
  return <LegalDocumentView model={getTermsOfServiceModel()} />;
}
