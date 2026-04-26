// Locations hero for New Jersey pages (state, county, city/service).

import Image from 'next/image';
import type { ReactNode } from 'react';

interface LocationsHeroProps {
  heroImage: string;
  heading: string;
  description: string;
  offerText?: string;
  cta?: ReactNode;
  reviewBadge?: ReactNode;
  cityName: string;
}

export function LocationsHero({
  heroImage,
  heading,
  description,
  offerText,
  cta,
  reviewBadge,
  cityName,
}: LocationsHeroProps) {
  return (
    <div className="relative isolate overflow-hidden bg-background">
      {/* Mobile / tablet (<=1024px) */}
      <div className="relative lg:hidden">
        <div className="relative w-full overflow-hidden rounded-b-2xl">
          <div className="relative h-[250px] w-full sm:h-320px">
            <Image
              src={heroImage}
              alt={`${cityName} laundry and dry cleaning service`}
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-b from-transparent to-background" />
        </div>

        <div className="px-6 pb-10 pt-8 sm:pt-10">
          <h1 className="text-center text-3xl font-normal leading-tight tracking-tight text-foreground md:text-4xl">
            {heading}
          </h1>
          <p className="mt-4 text-center text-lg leading-relaxed text-foreground/80">
            {description}
          </p>

          <div className="mt-8 space-y-4">
            {cta && (
              <div className="mx-auto w-full max-w-[360px] *:w-full">{cta}</div>
            )}
            {offerText && (
              <p className="text-center text-base font-medium text-primary">
                {offerText}
              </p>
            )}
            {reviewBadge && (
              <div className="flex justify-center">{reviewBadge}</div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop (>=1024px) */}
      <div className="relative hidden lg:block">
        <section className="relative isolate flex items-start overflow-hidden bg-background pb-16 pt-[calc(64px+44px)]">
          <div className="absolute inset-0 -z-10">
            <Image
              src={heroImage}
              alt={`${cityName} laundry and dry cleaning service`}
              className="w-full object-cover object-bottom"
              width={1920}
              height={300}
              sizes="100vw"
              priority
            />
          </div>

          <div className="relative z-10 mx-auto flex w-full max-w-6xl justify-center px-6">
            <div className="max-w-xl rounded-2xl bg-background p-12">
              <h1 className="text-center text-4xl font-normal leading-[1.16] tracking-tight text-foreground">
                {heading}
              </h1>
              <p className="mt-4 text-center text-lg leading-relaxed text-foreground/80">
                {description}
              </p>

              <div className="mt-8 space-y-4">
                {cta && <div className="mx-auto w-fit">{cta}</div>}
                {offerText && (
                  <p className="text-center text-base font-medium text-primary">
                    {offerText}
                  </p>
                )}
                {reviewBadge && (
                  <div className="flex justify-center">{reviewBadge}</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
