import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Terms of Service',
  description:
    'Read the Pressly terms of service for laundry and dry cleaning pickup and delivery.',
  path: '/terms',
});

export { default } from '@/routes/terms/route';
