import { buildPageMetadata } from '@/lib/seo';

export const metadata = buildPageMetadata({
  title: 'Commercial Laundry and Dry Cleaning Service',
  description:
    'Commercial laundry and dry cleaning pickup and delivery for New Jersey businesses, offices, salons, gyms, hospitality teams, and local operators.',
  path: '/commercial',
});

export { default } from '@/routes/commercial/route';
