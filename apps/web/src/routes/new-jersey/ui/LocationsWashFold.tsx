import Image from 'next/image';
import PrimaryButton from '@/routes/shared/ui/components/PrimaryButton';
import { OFFER_COPY } from '@/routes/shared/marketing/content';
import { ShoppingBag, Grid3x3, Layers, BedDouble } from 'lucide-react';

const PRICING_ITEMS = [
  {
    icon: ShoppingBag,
    label: 'Per Pound',
    price: '$1.67 / lb',
  },
];

const INDIVIDUALLY_PRICED = [
  {
    icon: Grid3x3,
    label: 'Bathmat',
    price: '$5.95',
  },
  {
    icon: Layers,
    label: 'Small Comforter',
    price: '$9.95',
  },
  {
    icon: BedDouble,
    label: 'Duvet',
    price: '$14.95',
  },
  {
    icon: Layers,
    label: 'Large Comforter',
    price: '$19.95',
  },
];

export default function LocationsWashFold() {
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

          {/* Price per Pound */}
          {PRICING_ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={index}
                className="flex items-center justify-between py-4 border-b border-border"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-6 h-6 text-foreground" strokeWidth={1.5} />
                  <span className="text-base font-medium text-foreground">
                    {item.label}
                  </span>
                </div>
                <span className="text-lg font-semibold text-foreground">
                  {item.price}
                </span>
              </div>
            );
          })}

          {/* Individually Priced Section */}
          <div className="mt-6">
            <h4 className="text-sm font-bold uppercase tracking-wide text-foreground mb-4">
              INDIVIDUALLY PRICED
            </h4>
            <div className="space-y-4">
              {INDIVIDUALLY_PRICED.map((item, index) => {
                const Icon = item.icon;
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className="w-5 h-5 text-foreground"
                        strokeWidth={1.5}
                      />
                      <span className="text-base text-foreground">
                        {item.label}
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
        </div>

        <div className="space-y-4">
          <PrimaryButton href="/schedule" className="w-full sm:w-auto">
            Schedule a Pickup
          </PrimaryButton>
          <p className="text-center lg:text-left text-base font-medium text-primary">
            {OFFER_COPY}
          </p>
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[600px] aspect-video mx-auto lg:mx-0">
        <Image
          src="/graphic-img/wash-fold.webp"
          alt="Wash and fold laundry service"
          fill
          className="object-cover rounded-lg"
        />
      </div>
    </div>
  );
}
