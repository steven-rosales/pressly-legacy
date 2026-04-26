import Image from 'next/image';
import PrimaryButton from '@/common/ui/primitives/PrimaryButton';
import SecondaryButton from '@/common/ui/primitives/SecondaryButton';

export default function HomeHero() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-center lg:items-start w-full">
      <div className="flex flex-col w-full lg:w-1/2 text-center lg:text-left">
        <h1 className="text-5xl sm:text-5xl lg:text-6xl font-semibold mb-4 sm:mb-6">
          There&apos;s better things to do than laundry
        </h1>
        <p className="text-base sm:text-lg lg:text-[20px] mb-8 sm:mb-10 lg:mb-12 mx-auto lg:mx-0 max-w-[500px] lg:max-w-[600px]">
          Pressly picks up, cleans, and delivers your laundry and dry cleaning.
          Pickup & delivery is free
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2 w-full sm:w-auto mx-auto lg:mx-0">
          <PrimaryButton href="/signup">Schedule a Pickup</PrimaryButton>
          <SecondaryButton href="/services-pricing/wash-fold">
            Services & Pricing
          </SecondaryButton>
        </div>
      </div>
      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[500px] aspect-4/3 mx-auto lg:mx-0">
        <Image
          src="/graphic-img/hero-customer.webp"
          alt="Laundry Customer leaving laundry outside for pickup."
          fill
          className="object-contain rounded-lg"
          priority
        />
      </div>
    </div>
  );
}
