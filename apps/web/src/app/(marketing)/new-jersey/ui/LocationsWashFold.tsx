import Image from 'next/image';
import { ORDER_ENTRY_OFFER_COPY } from '@/features/order-entry/content';
import { SchedulePickupButton } from '@/features/order-entry/ui/SchedulePickupButton';
import type { WashFoldPricingModel } from '@/features/pricing/model';
import { PricingErrorCallout } from '@/features/pricing/ui/PricingErrorCallout';
import { ShoppingBag, Grid3x3, Layers, BedDouble } from 'lucide-react';

const getSpecialtyIcon = (name: string) => {
  if (name === 'Bathmat') return Grid3x3;
  if (name === 'Duvet') return BedDouble;
  return Layers;
};

export default function LocationsWashFold({
  pricing,
}: {
  pricing: WashFoldPricingModel;
}) {
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
          Life&apos;s busy enough already. Let us take the laundry off your
          hands so you can enjoy a little more breathing room, a little more
          calm, and a lot more time for yourself.
        </p>

        {/* Pricing Card */}
        <div className="bg-card border border-border rounded-2xl p-6 lg:p-8 mb-6 w-full max-w-[400px] lg:max-w-[450px] mx-auto lg:mx-0">
          <h3 className="text-2xl font-semibold mb-6">Pricing</h3>

          {pricing.error === undefined ? (
            <>
              <div className="flex items-center justify-between py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <ShoppingBag
                    className="w-6 h-6 text-foreground"
                    strokeWidth={1.5}
                  />
                  <span className="text-base font-medium text-foreground">
                    Per Pound
                  </span>
                </div>
                <span className="text-lg font-semibold text-foreground">
                  {pricing.basePrice} / lb
                </span>
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-bold uppercase tracking-wide text-foreground mb-4">
                  INDIVIDUALLY PRICED
                </h4>
                <div className="space-y-4">
                  {pricing.specialtyItems.map((item) => {
                    const Icon = getSpecialtyIcon(item.name);
                    return (
                      <div
                        key={item.name}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <Icon
                            className="w-5 h-5 text-foreground"
                            strokeWidth={1.5}
                          />
                          <span className="text-base text-foreground">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-base font-semibold text-foreground">
                          {item.price}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <PricingErrorCallout
              title={pricing.error.title}
              message={pricing.error.message}
              canRetry={pricing.error.canRetry}
            />
          )}
        </div>

        <div className="space-y-4">
          <SchedulePickupButton
            source="location_wash_fold"
            className="w-full sm:w-auto"
          >
            Schedule a Pickup
          </SchedulePickupButton>
          <p className="text-center lg:text-left text-base font-medium text-primary">
            {ORDER_ENTRY_OFFER_COPY}
          </p>
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
