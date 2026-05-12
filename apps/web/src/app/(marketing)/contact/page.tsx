import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/(marketing)/shared/marketing/seo';
import ContactView from './ui/ContactView';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contact Pressly customer care.',
  path: '/contact',
});

export default ContactView;
