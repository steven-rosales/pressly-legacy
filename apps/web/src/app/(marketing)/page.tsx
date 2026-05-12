import type { Metadata } from 'next';

import { DELIVERY_FEE_SHORT_COPY } from '@/app/(marketing)/shared/marketing/content';
import { buildPageMetadata } from '@/app/(marketing)/shared/marketing/seo';
import { PublicSiteShell } from '@/app/(marketing)/shared/ui/public/PublicSiteShell';
import HomeConquerTime from './home/ui/HomeConquerTime';
import HomeDryCleaning from './home/ui/HomeDryCleaning';
import HomeHero from './home/ui/HomeHero';
import HomeHiw from './home/ui/HomeHiw';
import HomeTestimonials from './home/ui/HomeTestimonials';
import HomeWashFold from './home/ui/HomeWashFold';

export const metadata: Metadata = buildPageMetadata({
  title: 'Laundry & Dry Cleaning Pickup and Delivery',
  description: `Pressly offers wash and fold laundry and dry cleaning pickup and delivery in New Jersey with clear pricing, a ${DELIVERY_FEE_SHORT_COPY}, and online scheduling.`,
  path: '/',
});

export default function HomePage() {
  return (
    <PublicSiteShell mainClassName="bg-background">
      <section className="mx-auto max-w-[1440px] px-4 pt-12 pb-[88px] sm:px-6 lg:pt-16 lg:pb-12">
        <HomeHero />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeHiw />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeWashFold />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeDryCleaning />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeTestimonials />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeConquerTime />
      </section>
    </PublicSiteShell>
  );
}
