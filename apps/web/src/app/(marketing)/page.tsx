import type { Metadata } from 'next';

import { buildPageMetadata } from '@/app/_lib/seo';
import { DELIVERY_FEE_SHORT_COPY } from '@/features/pricing/presenter';
import { getHomePageModel } from './home/model';
import HomeConquerTime from './home/ui/HomeConquerTime';
import HomeDryCleaning from './home/ui/HomeDryCleaning';
import HomeHero from './home/ui/HomeHero';
import HomeHiw from './home/ui/HomeHiw';
import HomeTestimonials from './home/ui/HomeTestimonials';
import HomeWashFold from './home/ui/HomeWashFold';

export const metadata: Metadata = buildPageMetadata({
  title: 'Laundry & Dry Cleaning Pickup and Delivery',
  description: `Pressly offers wash and fold laundry and dry cleaning pickup and delivery in New Jersey with clear pricing, ${DELIVERY_FEE_SHORT_COPY}, and online scheduling.`,
  path: '/',
});

export default function HomePage() {
  const model = getHomePageModel();

  return (
    <>
      <section className="mx-auto max-w-[1440px] px-4 pt-12 pb-[88px] sm:px-6 lg:pt-16 lg:pb-12">
        <HomeHero model={model.hero} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeHiw model={model.hiw} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeWashFold model={model.washFold} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeDryCleaning model={model.dryCleaning} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeTestimonials model={model.testimonials} />
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-[88px] sm:px-6 lg:py-20">
        <HomeConquerTime model={model.bottom} />
      </section>
    </>
  );
}
