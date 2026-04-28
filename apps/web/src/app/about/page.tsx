import { buildPageMetadata } from '@/routes/shared/marketing/seo';

export const metadata = buildPageMetadata({
  title: 'About Pressly',
  description:
    'Learn about Pressly laundry and dry cleaning pickup and delivery.',
  path: '/about',
});

export { default } from '@/routes/about/route';
