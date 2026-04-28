'use client';

import Image from 'next/image';
import posthog from 'posthog-js';
import PrimaryButton from '@/routes/shared/ui/components/PrimaryButton';
import SecondaryButton from '@/routes/shared/ui/components/SecondaryButton';

export default function HomeConquerTime() {
  return (
    <div className="flex flex-col items-center text-center w-full">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
        Conquer Your Time
      </p>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6 lg:mb-8 max-w-4xl">
        Skip the Hassle of Laundry Day
      </h2>
      <p className="text-base sm:text-lg lg:text-[20px] mb-6 leading-relaxed text-muted-foreground max-w-[800px]">
        Pressly has now saved 10+ years of customer time.
      </p>
      <p className="text-base sm:text-lg lg:text-[20px] mb-8 lg:mb-12 leading-relaxed text-muted-foreground max-w-[800px]">
        Join thousands of people in having a laundry-free life. Schedule a
        same-day pickup and get it back the very next day!
      </p>

      <div className="mb-8 flex w-full flex-col gap-3 lg:mb-12 lg:w-auto lg:flex-row lg:gap-2">
        <span
          className="block w-full lg:w-auto"
          onClick={() =>
            posthog.capture('schedule_pickup_clicked', {
              source: 'home_mid_page',
            })
          }
        >
          <PrimaryButton href="/schedule" className="w-full lg:w-auto">
            Schedule a Pickup
          </PrimaryButton>
        </span>
        <SecondaryButton
          href="/services-pricing/wash-fold"
          className="w-full lg:w-auto"
        >
          Services & Pricing
        </SecondaryButton>
      </div>

      <div className="relative w-full max-w-[600px] aspect-4/3 lg:aspect-video">
        <Image
          src="/graphic-img/conquer-time.webp"
          alt="Conquer your time with Pressly laundry service"
          fill
          className="object-contain"
        />
      </div>
    </div>
  );
}
