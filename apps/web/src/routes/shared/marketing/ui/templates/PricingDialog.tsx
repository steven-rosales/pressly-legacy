'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/common/shadcn/dialog';
import { Shirt, User, Sparkles, Home, Zap } from 'lucide-react';

const FULL_PRICING = [
  {
    icon: Shirt,
    category: 'Tops',
    items: [
      { label: 'Shirts', price: '$4.95' },
      { label: 'Polo', price: '$4.95' },
      { label: 'Blouse', price: '$7.95' },
      { label: 'Sweater', price: '$8.50' },
      { label: 'Vest', price: '$8.50' },
      { label: 'Blazer / Jacket', price: '$9.95' },
    ],
  },
  {
    icon: User,
    category: 'Bottoms',
    items: [
      { label: 'Shorts', price: '$6.95' },
      { label: 'Skirt', price: '$6.95' },
      { label: 'Pants', price: '$8.95' },
    ],
  },
  {
    icon: Sparkles,
    category: 'Full Body',
    items: [
      { label: 'Casual Dress', price: '$9.50' },
      { label: 'Coat', price: '$17.95' },
      { label: 'Suit - Full Piece', price: '$18.90' },
      { label: 'Formal Dress', price: '$25.90' },
    ],
  },
  {
    icon: Home,
    category: 'Household',
    items: [
      { label: 'Rugs', price: '$3.25 /sqft' },
      { label: 'Sheet / Blanket', price: '$12.95' },
      { label: 'Tablecloth', price: '$18.95' },
      { label: 'Curtain', price: '$37.95' },
      { label: 'Comforter', price: '$39.95' },
    ],
  },
  {
    icon: Zap,
    category: 'Accessories',
    items: [
      { label: 'Napkin', price: '$1.95' },
      { label: 'Scarf', price: '$5.95' },
      { label: 'Tie', price: '$6.95' },
    ],
  },
];

export function PricingDialog() {
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
          {FULL_PRICING.map((category, idx) => {
            const Icon = category.icon;
            return (
              <div key={idx}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="w-5 h-5 text-foreground" strokeWidth={1.5} />
                  <h3 className="text-lg font-semibold text-foreground">
                    {category.category}
                  </h3>
                </div>
                <div className="space-y-3 pl-7">
                  {category.items.map((item, itemIdx) => (
                    <div
                      key={itemIdx}
                      className="flex items-center justify-between py-2 border-b border-border last:border-0"
                    >
                      <span className="text-base text-foreground">
                        {item.label}
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
