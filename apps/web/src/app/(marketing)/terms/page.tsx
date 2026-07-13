import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/_lib/seo';
import { LegalDocumentView } from '../_legal/LegalDocumentView';
import { getTermsOfServiceModel } from '../_legal/model';

export const metadata: Metadata = buildPageMetadata({
  title: 'Terms of Service',
  description:
    'Read the Pressly terms of service for laundry and dry cleaning pickup and delivery.',
  path: '/terms',
});

export default function TermsOfServicePage() {
  return <LegalDocumentView model={getTermsOfServiceModel()} />;
}
