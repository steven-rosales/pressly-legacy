import WashFoldRoute from '@/routes/services-pricing/wash-fold/route';
import { buildPageMetadata } from '@/routes/shared/marketing/seo';

export const revalidate = 3600;
export const metadata = buildPageMetadata({
  title: 'Wash & Fold Laundry Service Pricing',
  description:
    'See Pressly wash and fold laundry pricing, pickup details, specialty item pricing, minimums, and delivery information for New Jersey service areas.',
  path: '/services-pricing/wash-fold',
  image: '/graphic-img/wash-fold.webp',
});

export default WashFoldRoute;
