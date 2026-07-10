import Image from 'next/image';
import { ORDER_ENTRY_OFFER_COPY } from '@/features/order-entry/content';
import { SchedulePickupButton } from '@/features/order-entry/ui/SchedulePickupButton';

interface LocationsStoryProps {
  title: string;
  heading: string;
  paragraphs: readonly string[];
  heroImage?: string | undefined;
  locationLabel?: string | undefined;
}

export function LocationsStory({
  title,
  heading,
  paragraphs,
  heroImage,
  locationLabel,
}: LocationsStoryProps) {
  return (
    <section className="bg-foreground py-16 text-background md:py-20 lg:py-24">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 lg:flex-row lg:items-start lg:gap-12">
        <div className="flex-1 space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-background/70">
            {title}
          </p>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight md:text-4xl">
            {heading}
          </h2>
          <div className="space-y-4 text-base leading-relaxed text-background/90">
            {paragraphs.map((para, idx) => (
              <p key={idx}>{para}</p>
            ))}
          </div>
          <div className="mt-6 flex w-full max-w-md flex-col items-start gap-3 lg:w-auto lg:max-w-none">
            <SchedulePickupButton
              source="location_story"
              className="w-full sm:w-auto"
            >
              Schedule a Pickup
            </SchedulePickupButton>
            <p className="text-center text-base font-medium text-primary">
              {ORDER_ENTRY_OFFER_COPY}
            </p>
          </div>
        </div>

        {heroImage ? (
          <div className="relative w-full shrink-0 overflow-hidden rounded-2xl lg:w-[320px]">
            <div className="relative aspect-3/5 w-full max-h-56 lg:max-h-none">
              <Image
                src={heroImage}
                alt={locationLabel ?? heading}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 320px"
                priority={false}
              />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
