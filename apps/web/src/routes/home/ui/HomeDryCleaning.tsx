import Image from 'next/image';
import PrimaryButton from '@/routes/shared/ui/components/PrimaryButton';
import { OFFER_COPY } from '@/routes/shared/marketing/content';

const FEATURES = [
  {
    title: 'Gentle, Fabric-Safe Cleaning',
  },
  {
    title: 'Crisp Pressing & Finishing',
  },
  {
    title: 'Stain Treatment Included',
  },
  {
    title: 'Convenient Pickup & Delivery',
  },
];

export default function DryCleaning() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center w-full">
      <div className="flex w-full lg:w-1/2 flex-col text-center lg:text-left">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
          Dry Cleaning
        </p>
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6 lg:mb-8">
          Skip the Trips to the Dry Cleaner
        </h2>
        <p className="text-base sm:text-lg lg:text-[20px] mb-8 lg:mb-12 leading-relaxed text-muted-foreground max-w-[600px] mx-auto lg:mx-0">
          Life moves fast, and dropping off dry cleaning shouldn&apos;t slow you
          down. We pick it up, clean it with care, and bring it back looking
          sharp—so you always feel ready for whatever&apos;s next.
        </p>

        <div className="flex flex-col gap-6">
          <h3 className="text-xl sm:text-2xl font-semibold">
            Service Features
          </h3>
          <div className="grid grid-cols-2 gap-4 lg:gap-6">
            {FEATURES.map((feature, index) => (
              <div key={index}>
                <h4 className="text-base sm:text-lg font-semibold text-foreground">
                  {feature.title}
                </h4>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            <PrimaryButton href="/schedule" className="w-full lg:w-auto">
              Schedule a Pickup
            </PrimaryButton>
            <p className="text-center lg:text-left text-base font-medium text-primary">
              {OFFER_COPY}
            </p>
          </div>
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[600px] aspect-video mx-auto lg:mx-0">
        <Image
          src="/graphic-img/dry-cleaning.webp"
          alt="Dry cleaning service"
          fill
          className="object-cover rounded-lg"
        />
      </div>
    </div>
  );
}
