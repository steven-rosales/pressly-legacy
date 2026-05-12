import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import { DELIVERY_FEE_SHORT_COPY } from '@/app/(marketing)/shared/marketing/content';
import { Check } from 'lucide-react';

interface PricingItem {
  service: string;
  unit: string;
  category: string;
  name: string;
  priceCents: number;
}

interface PricingCatalog {
  items: PricingItem[];
}

const PRICING_FEATURES = [
  { text: 'Pickup & Delivery Available' },
  { text: 'Cleaned to your preferences' },
  { text: 'Next-day turnaround' },
  { text: 'Professional folding' },
];

const FALLBACK_PER_LB_CENTS = 167;

const FALLBACK_SPECIALTY_ITEMS = [
  { name: 'Small Comforter', price: '$9.95' },
  { name: 'Large Comforter', price: '$19.95' },
  { name: 'Duvet', price: '$14.95' },
  { name: 'Bathmat', price: '$5.95' },
];

const formatUsdFromCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function WashFoldPricing(props: {
  pricing: PricingCatalog | null;
}) {
  const wfItems =
    props.pricing?.items.filter((i) => i.service === 'wash_fold') ?? [];

  const perLb = wfItems.find((i) => i.unit === 'lb');
  const perLbCents = perLb?.priceCents ?? FALLBACK_PER_LB_CENTS;

  const specialtyItems =
    wfItems
      .filter((i) => i.category === 'Specialty')
      .map((i) => ({
        name: i.name,
        price: formatUsdFromCents(i.priceCents),
      })) ?? FALLBACK_SPECIALTY_ITEMS;

  const displayedSpecialtyItems =
    specialtyItems.length > 0 ? specialtyItems : FALLBACK_SPECIALTY_ITEMS;

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
                {formatUsdFromCents(perLbCents)}
              </span>
              <span className="text-xl text-muted-foreground sm:text-2xl">
                / lb
              </span>
            </div>

            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                Includes cleaning to your preferences and professional folding.
                Pickup and delivery are available with a{' '}
                {DELIVERY_FEE_SHORT_COPY}.
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
              {displayedSpecialtyItems.map((item) => (
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
                {PRICING_FEATURES.map((feature) => (
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
