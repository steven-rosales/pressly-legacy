import Image from 'next/image';
import { SchedulePickupButton } from '#customer/features/order-entry/ui/SchedulePickupButton';
import type { HomeServiceSectionModel } from '../model';

export default function DryCleaning({
  model,
}: {
  model: HomeServiceSectionModel;
}) {
  return (
    <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 items-center w-full">
      <div className="flex w-full lg:w-1/2 flex-col text-center lg:text-left">
        <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground mb-4">
          {model.eyebrow}
        </p>
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-6 lg:mb-8">
          {model.title}
        </h2>
        <p className="text-base sm:text-lg lg:text-[20px] mb-8 lg:mb-12 leading-relaxed text-muted-foreground max-w-[600px] mx-auto lg:mx-0">
          {model.description}
        </p>

        <div className="flex flex-col gap-6">
          <h3 className="text-xl sm:text-2xl font-semibold">
            {model.featuresTitle}
          </h3>
          <div className="grid grid-cols-2 gap-4 lg:gap-6">
            {model.features.map((feature) => (
              <div key={feature.title}>
                <h4 className="text-base sm:text-lg font-semibold text-foreground">
                  {feature.title}
                </h4>
              </div>
            ))}
          </div>
          <div className="mt-6 space-y-4">
            <SchedulePickupButton
              source={model.ctaSource}
              className="w-full lg:w-auto"
            >
              Schedule a Pickup
            </SchedulePickupButton>
            <p className="text-center lg:text-left text-base font-medium text-primary">
              {model.offerText}
            </p>
          </div>
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[600px] aspect-video mx-auto lg:mx-0">
        <Image
          src={model.image.src}
          alt={model.image.alt}
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className="object-cover rounded-lg"
        />
      </div>
    </div>
  );
}
