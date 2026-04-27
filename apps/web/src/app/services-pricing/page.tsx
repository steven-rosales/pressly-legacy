import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Services & Pricing',
  description:
    'Review Pressly wash and fold laundry and dry cleaning pricing before scheduling pickup and delivery.',
  path: '/services-pricing',
});

export { default } from '@/routes/services-pricing/route';
