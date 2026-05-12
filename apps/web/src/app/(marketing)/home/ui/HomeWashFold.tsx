import Image from 'next/image';
import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import { OFFER_COPY } from '@/app/(marketing)/shared/marketing/content';

const FEATURES = [
  {
    title: 'Scented Or Free & Clear',
  },
  {
    title: 'Careful Low-Heat Drying',
  },
  {
    title: 'Neatly Folded & Bagged',
  },
  {
    title: 'Fast 1 Day Turnaround',
  },
];

export default function WashFold() {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center w-full">
      <div className="flex w-full lg:w-1/2 flex-col text-center lg:text-left">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
          Wash & Fold
        </p>
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6 lg:mb-8">
          Clean Laundry at Your Fingertips
        </h2>
        <p className="text-base sm:text-lg lg:text-[20px] mb-8 lg:mb-12 leading-relaxed text-muted-foreground max-w-[600px] mx-auto lg:mx-0">
          Life’s busy enough already. Let us take the laundry off your hands so
          you can enjoy a little more breathing room, a little more calm, and a
          lot more time for yourself.
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
            <SchedulePickupButton
              source="home_wash_fold"
              className="w-full lg:w-auto"
            />
            <p className="text-center lg:text-left text-base font-medium text-primary">
              {OFFER_COPY}
            </p>
          </div>
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[600px] aspect-video mx-auto lg:mx-0">
        <Image
          src="/graphic-img/wash-fold.webp"
          alt="Wash and fold laundry service"
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className="object-cover rounded-lg"
        />
      </div>
    </div>
  );
}
