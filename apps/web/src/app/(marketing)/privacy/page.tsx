import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { getPrivacyPolicyModel } from '@/app/shared/legal/model';
import { LegalDocumentView } from '@/app/shared/legal/ui/LegalDocumentView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Read the Pressly privacy policy for laundry and dry cleaning pickup and delivery customers.',
  path: '/privacy',
});

export default function PrivacyPolicyPage() {
  return <LegalDocumentView model={getPrivacyPolicyModel()} />;
}
