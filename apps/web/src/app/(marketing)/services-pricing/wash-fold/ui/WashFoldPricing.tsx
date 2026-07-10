import { SchedulePickupButton } from '@/features/order-entry/ui/SchedulePickupButton';
import type { WashFoldPricingModel } from '@/features/pricing/model';
import { PricingErrorCallout } from '@/features/pricing/ui/PricingErrorCallout';
import { Check } from 'lucide-react';

export default function WashFoldPricing({
  model,
}: {
  model: WashFoldPricingModel;
}) {
  if (model.error !== undefined)
    return (
      <PricingErrorCallout
        title={model.error.title}
        message={model.error.message}
        canRetry={model.error.canRetry}
      />
    );

  return (
    <div className="w-full">
      <div className="text-center mb-8 lg:mb-12">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4">
          Pricing That Fits Your Needs
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground max-w-[700px] mx-auto">
          Simple, transparent pricing with no hidden fees. Pay only for what you
          use.
        </p>
      </div>

      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
        <div className="flex h-full flex-col rounded-3xl border border-border bg-background p-8 lg:p-10">
          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-3xl font-semibold tracking-wide text-muted-foreground">
                Simple Price At
              </h3>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                {model.basePrice}
              </span>
              <span className="text-xl text-muted-foreground sm:text-2xl">
                / lb
              </span>
            </div>

            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                Includes cleaning to your preferences and professional folding.
                Pickup and delivery are available with{' '}
                {model.deliveryFee.shortCopy}.
              </p>
              <p>
                No subscriptions and no hidden fees - you only pay for what you
                send.
              </p>
            </div>
          </div>

          <div className="mt-auto pt-10">
            <SchedulePickupButton source="wash_fold_pricing">
              Schedule a Pickup
            </SchedulePickupButton>
          </div>
        </div>

        <div className="flex h-full flex-col rounded-3xl border border-border bg-background p-8 lg:p-10">
          <div className="space-y-8">
            <div className="space-y-2">
              <h3 className="text-3xl font-semibold tracking-wide text-muted-foreground">
                Priced Individually
              </h3>
            </div>

            <div className="space-y-3">
              {model.specialtyItems.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between gap-6 text-sm sm:text-base"
                >
                  <span className="text-foreground">{item.name}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {item.price}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-8">
              <ul className="space-y-3" role="list">
                {model.features.map((feature) => (
                  <li key={feature.text} className="flex items-start gap-3">
                    <Check className="mt-0.5 size-5 shrink-0 text-primary" />
                    <span className="text-sm leading-relaxed text-muted-foreground sm:text-base">
                      {feature.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-auto pt-10">
            <SchedulePickupButton source="wash_fold_pricing">
              Schedule a Pickup
            </SchedulePickupButton>
          </div>
        </div>
      </div>
    </div>
  );
}
