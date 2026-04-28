import DryCleaningRoute from '@/routes/services-pricing/dry-cleaning/route';
import { buildPageMetadata } from '@/routes/shared/marketing/seo';

export const revalidate = 3600;
export const metadata = buildPageMetadata({
  title: 'Dry Cleaning Pickup and Delivery Pricing',
  description:
    'See Pressly dry cleaning pricing, pickup details, garment categories, minimums, and delivery information for New Jersey service areas.',
  path: '/services-pricing/dry-cleaning',
  image: '/graphic-img/dry-cleaning.webp',
});

export default DryCleaningRoute;
