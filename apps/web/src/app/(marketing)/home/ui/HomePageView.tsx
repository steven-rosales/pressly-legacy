import type { HomePageModel } from '../model';
import HomeConquerTime from './HomeConquerTime';
import HomeDryCleaning from './HomeDryCleaning';
import HomeHero from './HomeHero';
import HomeHiw from './HomeHiw';
import HomeTestimonials from './HomeTestimonials';
import HomeWashFold from './HomeWashFold';

export default function HomePageView({ model }: { model: HomePageModel }) {
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
