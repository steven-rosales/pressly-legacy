import SchedulePickupButton from '@/app/shared/ui/components/SchedulePickupButton';
import FetchErrorCallout from '@/app/shared/ui/components/FetchErrorCallout';
import type { DryCleaningPricingModel } from '@/app/shared/marketing/pricing';

export default function DryCleaningPricing({
  model,
}: {
  model: DryCleaningPricingModel;
}) {
  if (model.error !== undefined)
    return (
      <FetchErrorCallout
        title={model.error.title}
        message={model.error.message}
        canRetry={model.error.canRetry}
      />
    );

  return (
    <div className="w-full">
      <div className="text-center mb-8 lg:mb-12">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold mb-4">
          Price per Item
        </h2>
        <p className="text-base sm:text-lg text-muted-foreground max-w-[700px] mx-auto">
          Professional dry cleaning with transparent pricing. Each item is
          carefully cleaned and pressed.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
        {model.categories.map((category) => (
          <div
            key={category.title}
            className="rounded-xl border border-border bg-background overflow-hidden shadow-md"
          >
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-xl font-medium">{category.title}</h3>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                {category.items.map((item) => (
                  <div
                    key={`${category.title}-${item.name}`}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-foreground">{item.name}</span>
                    <span className="font-medium text-foreground">
                      {item.price}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <SchedulePickupButton
          source="dry_cleaning_pricing"
          className="w-full sm:w-auto px-12"
        >
          Schedule a Pickup
        </SchedulePickupButton>
        <p className="text-sm text-muted-foreground mt-4">
          Same-day pickup available • {model.deliveryFee.shortCopy}
        </p>
      </div>
    </div>
  );
}
