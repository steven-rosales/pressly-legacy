import Image from 'next/image';
import Link from 'next/link';

import { Button } from '#customer/components/ui/button';
import { SchedulePickupButton } from '#customer/features/order-entry/ui/SchedulePickupButton';
import type { HomePageModel } from '../model';

export default function HomeConquerTime({
  model,
}: {
  model: HomePageModel['bottom'];
}) {
  return (
    <div className="flex flex-col items-center text-center w-full">
      <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
        {model.eyebrow}
      </p>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6 lg:mb-8 max-w-4xl">
        {model.title}
      </h2>
      {model.paragraphs.map((paragraph, index) => (
        <p
          key={paragraph}
          className={`text-base sm:text-lg lg:text-[20px] leading-relaxed text-muted-foreground max-w-[800px] ${
            index === model.paragraphs.length - 1 ? 'mb-8 lg:mb-12' : 'mb-6'
          }`}
        >
          {paragraph}
        </p>
      ))}

      <div className="mb-8 flex w-full flex-col gap-3 lg:mb-12 lg:w-auto lg:flex-row lg:gap-2">
        <SchedulePickupButton
          source={model.primaryCtaSource}
          className="w-full lg:w-auto"
        >
          Schedule a Pickup
        </SchedulePickupButton>
        <Button
          asChild
          variant="outline"
          size="lg"
          className="w-full cursor-pointer bg-primary-foreground text-base text-foreground lg:w-auto"
        >
          <Link href={model.secondaryHref}>{model.secondaryLabel}</Link>
        </Button>
      </div>

      <div className="relative w-full max-w-[600px] aspect-4/3 lg:aspect-video">
        <Image
          src={model.image.src}
          alt={model.image.alt}
          fill
          sizes="(max-width: 768px) 100vw, 600px"
          className="object-contain"
        />
      </div>
    </div>
  );
}
