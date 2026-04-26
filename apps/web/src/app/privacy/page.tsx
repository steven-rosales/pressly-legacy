import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Read the Pressly privacy policy for laundry and dry cleaning pickup and delivery customers.',
  path: '/privacy',
});

export { default } from '@/routes/privacy/route';
