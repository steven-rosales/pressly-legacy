'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/shared/ui/shadcn/dialog';
import type { DryCleaningPricingModel } from '@/app/shared/marketing/pricing';
import { Shirt, User, Sparkles, Home, Zap } from 'lucide-react';

const getCategoryIcon = (category: string) => {
  if (category === 'Bottoms') return User;
  if (category === 'Full Body') return Sparkles;
  if (category === 'Household') return Home;
  if (category === 'Accessories') return Zap;
  return Shirt;
};

export function PricingDialog({
  categories,
}: {
  categories: DryCleaningPricingModel['categories'];
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-primary font-medium hover:underline text-sm cursor-pointer">
          View full pricing
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">Complete Pricing List</DialogTitle>
        </DialogHeader>

        <div className="space-y-8 mt-4">
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.title);
            return (
              <div key={category.title}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="w-5 h-5 text-foreground" strokeWidth={1.5} />
                  <h3 className="text-lg font-semibold text-foreground">
                    {category.title}
                  </h3>
                </div>
                <div className="space-y-3 pl-7">
                  {category.items.map((item) => (
                    <div
                      key={`${category.title}-${item.name}`}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <span className="text-base text-foreground">
                        {item.name}
                      </span>
                      <span className="text-base font-semibold text-foreground">
                        {item.price}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground">
            * Prices are subject to change. Special items may require additional
            charges.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
