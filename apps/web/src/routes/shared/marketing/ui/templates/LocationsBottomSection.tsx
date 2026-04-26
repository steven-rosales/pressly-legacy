import Image from 'next/image';

import PrimaryButton from '@/common/ui/primitives/PrimaryButton';

interface LocationsBottomSectionProps {
  title: string;
  description: string;
  ctaHref?: string;
  backgroundImage?: string;
}

export function LocationsBottomSection({
  title,
  description,
  ctaHref = '/schedule',
  backgroundImage = '/images/end-section.webp',
}: LocationsBottomSectionProps) {
  return (
    <div className="relative w-full min-h-[500px] py-16 lg:min-h-[600px] flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <Image
        src={backgroundImage}
        alt="Service background"
        fill
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
          <PrimaryButton href={ctaHref}>Schedule a Pickup</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
