import Image from 'next/image';

import PrimaryButton from '@/routes/shared/components/PrimaryButton';
import { OFFER_COPY } from '@/lib/content';
import {
  HiwTimeline,
  type HiwTimelineStep,
} from '@/routes/shared/public/HiwTimeline';

interface LocationsHiwProps {
  heading: string;
  steps: HiwTimelineStep[];
}

const LOCATION_HIW_IMAGES = [
  '/graphic-img/location-hiw-1.png.webp',
  '/graphic-img/location-hiw-2.png.webp',
  '/graphic-img/location-hiw-3.png.webp',
  '/graphic-img/location-hiw-4.png.webp',
] as const;

function LocationHiwStepImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-square w-full max-w-[108px] overflow-hidden sm:max-w-[150px] lg:max-w-[200px]">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-contain"
        sizes="(max-width: 640px) 120px, (max-width: 1024px) 160px, 200px"
      />
    </div>
  );
}

export function LocationsHiw({ heading, steps }: LocationsHiwProps) {
  const stepsWithMedia = steps.map((step, index) => {
    if (step.media) return step;

    const image = LOCATION_HIW_IMAGES[index];
    if (!image) return step;

    return {
      ...step,
      media: <LocationHiwStepImage src={image} alt={step.title} />,
    };
  });

  return (
    <section className="bg-background py-28 lg:py-20">
      <div className="mx-auto flex w-full max-w-[1450px] flex-col gap-10 px-6">
        <h2 className="text-center text-3xl font-semibold leading-tight tracking-tight text-foreground md:text-4xl lg:text-5xl">
          {heading}
        </h2>
        <div className="mx-auto w-full max-w-5xl">
          <HiwTimeline steps={stepsWithMedia} />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 text-center">
          <PrimaryButton href="/schedule" className="w-full sm:w-auto">
            Schedule a Pickup
          </PrimaryButton>
          <p className="text-center text-base font-medium text-primary">
            {OFFER_COPY}
          </p>
        </div>
      </div>
    </section>
  );
}
