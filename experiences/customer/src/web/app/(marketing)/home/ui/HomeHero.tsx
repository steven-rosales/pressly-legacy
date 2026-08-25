import Image from 'next/image';
import Link from 'next/link';

import { Button } from '#customer/components/ui/button';
import { SchedulePickupButton } from '#customer/features/order-entry/ui/SchedulePickupButton';
import type { HomePageModel } from '../model';

export default function HomeHero({ model }: { model: HomePageModel['hero'] }) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-center lg:items-start w-full">
      <div className="flex flex-col w-full lg:w-1/2 text-center lg:text-left">
        <h1 className="text-5xl sm:text-5xl lg:text-6xl font-semibold mb-4 sm:mb-6">
          {model.title}
        </h1>
        <p className="text-base sm:text-lg lg:text-[20px] mb-8 sm:mb-10 lg:mb-12 mx-auto lg:mx-0 max-w-[500px] lg:max-w-[600px]">
          {model.description}
        </p>
        <div className="mx-auto flex w-full flex-col gap-3 lg:mx-0 lg:w-auto lg:flex-row lg:gap-2">
          <SchedulePickupButton
            source={model.primaryCtaSource}
            className="w-full lg:w-auto"
          />
          <Button
            asChild
            variant="outline"
            size="lg"
            className="w-full cursor-pointer bg-primary-foreground text-base text-foreground lg:w-auto"
          >
            <Link href={model.secondaryHref}>{model.secondaryLabel}</Link>
          </Button>
        </div>
      </div>
      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[500px] aspect-4/3 mx-auto lg:mx-0">
        <Image
          src={model.image.src}
          alt={model.image.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 500px"
          className="object-contain rounded-lg"
          priority
        />
      </div>
    </div>
  );
}
