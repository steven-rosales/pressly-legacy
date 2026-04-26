import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Careers',
  description: 'Careers at Pressly.',
  path: '/careers',
});

export { default } from '@/routes/careers/route';
