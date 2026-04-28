import { buildPageMetadata } from '@/routes/shared/marketing/seo';

export const metadata = buildPageMetadata({
  title: 'Contact',
  description: 'Contact Pressly customer care.',
  path: '/contact',
});

export { default } from '@/routes/contact/route';
