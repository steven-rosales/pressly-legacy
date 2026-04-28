import { buildPageMetadata } from '@/routes/shared/marketing/seo';
import { DELIVERY_FEE_SHORT_COPY } from '@/routes/shared/marketing/content';

export const metadata = buildPageMetadata({
  title: 'Laundry & Dry Cleaning Pickup and Delivery',
  description: `Pressly offers wash and fold laundry and dry cleaning pickup and delivery in New Jersey with clear pricing, a ${DELIVERY_FEE_SHORT_COPY}, and online scheduling.`,
  path: '/',
});

export { default } from '@/routes/home/route';
