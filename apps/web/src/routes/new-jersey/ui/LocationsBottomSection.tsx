'use client';

import Image from 'next/image';

import SchedulePickupButton from '@/routes/shared/ui/components/SchedulePickupButton';
import { OFFER_COPY } from '@/routes/shared/marketing/content';

interface LocationsBottomSectionProps {
  title: string;
  description: string;
  backgroundImage?: string;
}

export function LocationsBottomSection({
  title,
  description,
  backgroundImage = '/images/end-section.webp',
}: LocationsBottomSectionProps) {
  return (
    <div className="relative w-full min-h-[500px] py-16 lg:min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <Image
        src={backgroundImage}
        alt="Service background"
        fill
        sizes="100vw"
        className="object-cover"
        priority={false}
      />

      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Content Card */}
      <div className="relative z-10 max-w-[600px] mx-auto px-4 sm:px-6">
        <div className="bg-background rounded-2xl p-8 sm:p-10 lg:p-12 text-center shadow-2xl">
          <h2 className="text-3xl sm:text-4xl lg:text-3xl font-semibold mb-6">
            {title}
          </h2>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed mb-8">
            {description}
          </p>
          <SchedulePickupButton
            source="location_bottom_section"
            className="w-full sm:w-auto"
          >
            Schedule a Pickup
          </SchedulePickupButton>
          <p className="mt-4 text-center text-base font-medium text-primary">
            {OFFER_COPY}
          </p>
        </div>
      </div>
    </div>
  );
}
