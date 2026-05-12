import SchedulePickupButton from '@/app/(marketing)/shared/ui/components/SchedulePickupButton';
import { DELIVERY_FEE_SHORT_COPY } from '@/app/(marketing)/shared/marketing/content';

interface PricingItem {
  service: string;
  unit: string;
  category: string;
  name: string;
  priceCents: number;
  sortOrder: number;
}

interface PricingCatalog {
  items: PricingItem[];
}

interface PricingCategory {
  title: string;
  items: { name: string; price: string }[];
}

const PRICING_CATEGORIES: PricingCategory[] = [
  {
    title: 'Tops',
    items: [
      { name: 'Shirts', price: '$4.95' },
      { name: 'Polo', price: '$4.95' },
      { name: 'Blouse', price: '$7.95' },
      { name: 'Sweater', price: '$8.50' },
      { name: 'Vest', price: '$8.50' },
      { name: 'Blazer / Jacket', price: '$9.95' },
    ],
  },
  {
    title: 'Bottoms',
    items: [
      { name: 'Shorts', price: '$6.95' },
      { name: 'Skirt', price: '$6.95' },
      { name: 'Pants', price: '$8.95' },
    ],
  },
  {
    title: 'Full Body',
    items: [
      { name: 'Casual Dress', price: '$9.50' },
      { name: 'Coat', price: '$17.95' },
      { name: 'Suit - Full Piece', price: '$18.90' },
      { name: 'Formal Dress', price: '$25.90' },
    ],
  },
  {
    title: 'Household',
    items: [
      { name: 'Rugs', price: '$3.25 /sqft' },
      { name: 'Sheet / Blanket', price: '$12.95' },
      { name: 'Tablecloth', price: '$18.95' },
      { name: 'Curtain', price: '$37.95' },
      { name: 'Comforter', price: '$39.95' },
    ],
  },
  {
    title: 'Accessories',
    items: [
      { name: 'Napkin', price: '$1.95' },
      { name: 'Scarf', price: '$5.95' },
      { name: 'Tie', price: '$6.95' },
    ],
  },
];

const formatUsdFromCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const toPriceLabel = (item: PricingItem): string => {
  const base = formatUsdFromCents(item.priceCents);
  return item.unit === 'sqft' ? `${base} /sqft` : base;
};

const getCategoriesFromPricing = (
  pricing: PricingCatalog | null,
): PricingCategory[] | null => {
  if (!pricing) return null;

  const items = pricing.items
    .filter((i) => i.service === 'dry_cleaning')
    .filter((i) => i.category !== 'Other Services')
    .slice()
    .sort((a, b) => {
      if (a.category !== b.category)
        return a.category.localeCompare(b.category);
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

  if (items.length === 0) return null;

  const map = new Map<string, Array<{ name: string; price: string }>>();
  for (const item of items) {
    const bucket = map.get(item.category) ?? [];
    bucket.push({ name: item.name, price: toPriceLabel(item) });
    map.set(item.category, bucket);
  }

  return [...map.entries()].map(([title, bucket]) => ({
    title,
    items: bucket,
  }));
};

export default function DryCleaningPricing(props: {
  pricing: PricingCatalog | null;
}) {
  const categories =
    getCategoriesFromPricing(props.pricing) ?? PRICING_CATEGORIES;

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
        {categories.map((category, categoryIndex) => (
          <div
            key={categoryIndex}
            className="rounded-xl border border-border bg-background overflow-hidden shadow-md"
          >
            <div className="px-6 py-4 border-b border-border">
              <h3 className="text-xl font-medium">{category.title}</h3>
            </div>

            <div className="p-6">
              <div className="space-y-3">
                {category.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
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
          Same-day pickup available • {DELIVERY_FEE_SHORT_COPY}
        </p>
      </div>
    </div>
  );
}
