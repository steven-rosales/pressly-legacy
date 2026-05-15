import Image from 'next/image';
import { OFFER_COPY } from '@/app/shared/marketing/content';
import type { DryCleaningPricingModel } from '@/app/shared/marketing/pricing';
import FetchErrorCallout from '@/app/shared/ui/components/FetchErrorCallout';
import SchedulePickupButton from '@/app/shared/ui/components/SchedulePickupButton';
import { Shirt, Wind, User, Briefcase, Sparkles } from 'lucide-react';
import { PricingDialog } from './PricingDialog';

const getPreviewIcon = (name: string) => {
  if (name === 'Blouse') return Wind;
  if (name === 'Pants') return User;
  if (name === 'Suit - Full Piece') return Briefcase;
  if (name.includes('Dress')) return Sparkles;
  return Shirt;
};

export default function LocationsDryCleaning({
  pricing,
}: {
  pricing: DryCleaningPricingModel;
}) {
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
          {pricing.minimumPrice === undefined ? null : (
            <p className="text-sm text-muted-foreground mb-6">
              Priced per item + {pricing.minimumPrice} minimum.
            </p>
          )}

          {pricing.error === undefined ? (
            <>
              <div>
                {pricing.previewItems.map((item, index) => {
                  const Icon = getPreviewIcon(item.name);
                  const isLast = index === pricing.previewItems.length - 1;
                  return (
                    <div
                      key={item.name}
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

              <div className="mt-3 pt-6 border-t border-border text-center">
                <PricingDialog categories={pricing.categories} />
              </div>
            </>
          ) : (
            <FetchErrorCallout
              title={pricing.error.title}
              message={pricing.error.message}
              canRetry={pricing.error.canRetry}
            />
          )}
        </div>

        <div className="space-y-4">
          <SchedulePickupButton
            source="location_dry_cleaning"
            className="w-full sm:w-auto"
          >
            Schedule a Pickup
          </SchedulePickupButton>
          <p className="text-center lg:text-left text-base font-medium text-primary">
            {OFFER_COPY}
          </p>
        </div>
      </div>

      <div className="relative w-full lg:w-1/2 max-w-[480px] sm:max-w-[540px] lg:max-w-[600px] aspect-video mx-auto lg:mx-0">
        <Image
          src="/graphic-img/dry-cleaning.webp"
          alt="Dry cleaning service"
          fill
          sizes="(max-width: 1024px) 100vw, 600px"
          className="object-cover rounded-lg"
        />
      </div>
    </div>
  );
}
