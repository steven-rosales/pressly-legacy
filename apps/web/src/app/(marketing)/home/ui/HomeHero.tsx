'use client';

import Image from 'next/image';
import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import SecondaryButton from '@/app/(marketing)/shared/ui/components/SecondaryButton';

export default function HomeHero() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-center lg:items-start w-full">
      <div className="flex flex-col w-full lg:w-1/2 text-center lg:text-left">
        <h1 className="text-5xl sm:text-5xl lg:text-6xl font-semibold mb-4 sm:mb-6">
          New Jersey Laundry Service & Dry Cleaning
        </h1>
        <p className="text-base sm:text-lg lg:text-[20px] mb-8 sm:mb-10 lg:mb-12 mx-auto lg:mx-0 max-w-[500px] lg:max-w-[600px]">
          Pressly picks up, cleans, and delivers your laundry and dry cleaning.
          Quickest pickup & delivery in the area!
        </p>
        <div className="mx-auto flex w-full flex-col gap-3 lg:mx-0 lg:w-auto lg:flex-row lg:gap-2">
          <SchedulePickupButton
            source="home_hero"
            className="w-full lg:w-auto"
          />
          <SecondaryButton
            href="/services-pricing/wash-fold"
            className="w-full lg:w-auto"
          >
            Services & Pricing
          </SecondaryButton>
        </div>
      </div>
      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[500px] aspect-4/3 mx-auto lg:mx-0">
        <Image
          src="/graphic-img/hero-customer.webp"
          alt="Laundry Customer leaving laundry outside for pickup."
          fill
          sizes="(max-width: 1024px) 100vw, 500px"
          className="object-contain rounded-lg"
          priority
        />
      </div>
    </div>
  );
}
