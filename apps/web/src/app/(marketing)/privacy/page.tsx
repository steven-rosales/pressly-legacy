import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/_lib/seo';
import { LegalDocumentView } from '../_legal/LegalDocumentView';
import { getPrivacyPolicyModel } from '../_legal/model';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Read the Pressly privacy policy for laundry and dry cleaning pickup and delivery customers.',
  path: '/privacy',
});

export default function PrivacyPolicyPage() {
  return <LegalDocumentView model={getPrivacyPolicyModel()} />;
}
