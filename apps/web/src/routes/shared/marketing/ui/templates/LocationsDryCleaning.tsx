import Image from 'next/image';
import PrimaryButton from '@/common/ui/primitives/PrimaryButton';
import { Shirt, Wind, User, Briefcase, Sparkles } from 'lucide-react';
import { PricingDialog } from './PricingDialog';

const PRICING_ITEMS = [
  {
    icon: Shirt,
    label: 'Shirts',
    price: '$4.95',
  },
  {
    icon: Wind,
    label: 'Blouse',
    price: '$7.95',
  },
  {
    icon: User,
    label: 'Pants',
    price: '$8.95',
  },
  {
    icon: Sparkles,
    label: 'Casual Dress',
    price: '$9.50',
  },
  {
    icon: Briefcase,
    label: 'Suit - Full Piece',
    price: '$18.90',
  },
];

export default function LocationsDryCleaning() {
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

        {/* Pricing Card */}
        <div className="bg-card border border-border rounded-2xl p-6 lg:p-8 mb-6 w-full max-w-[400px] lg:max-w-[450px] mx-auto lg:mx-0">
          <h3 className="text-2xl font-semibold mb-2">Pricing</h3>
          <p className="text-sm text-muted-foreground mb-6">
            Priced per item + $25 minimum.
          </p>

          {/* Pricing Items */}
          <div>
            {PRICING_ITEMS.map((item, index) => {
              const Icon = item.icon;
              const isLast = index === PRICING_ITEMS.length - 1;
              return (
                <div
                  key={index}
                  className={`flex items-center justify-between ${
                    isLast ? 'pt-3' : 'py-3'
                  } ${!isLast ? 'border-b border-border' : ''}`}
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

          {/* View Full Pricing Link */}
          <div className="mt-3 pt-6 border-t border-border text-center">
            <PricingDialog />
          </div>
        </div>

        <div className="space-y-4">
          <PrimaryButton href="/schedule" className="w-full sm:w-auto">
            Schedule a Pickup
          </PrimaryButton>
          <p className="text-center lg:text-left text-base font-medium text-primary">
            Free pickup & delivery and $20 OFF automatically applied.
          </p>
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
