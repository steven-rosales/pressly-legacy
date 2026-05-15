import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/shared/marketing/seo';
import { getContactPageModel } from './model';
import ContactView from './ui/ContactView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contact Pressly customer care.',
  path: '/contact',
});

export default function ContactPage() {
  return <ContactView model={getContactPageModel()} />;
}
