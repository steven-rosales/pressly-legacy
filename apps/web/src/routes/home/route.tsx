import { PublicSiteShell } from '@/routes/shared/public/PublicSiteShell';
import HomeConquerTime from './ui/HomeConquerTime';
import HomeDryCleaning from './ui/HomeDryCleaning';
import HomeHero from './ui/HomeHero';
import HomeHiw from './ui/HomeHiw';
import HomeTestimonials from './ui/HomeTestimonials';
import HomeWashFold from './ui/HomeWashFold';

export default function HomeRoute() {
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
