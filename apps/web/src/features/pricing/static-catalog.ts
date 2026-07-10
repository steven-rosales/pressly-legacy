import type {
  PricingCatalogResult,
  PricingItemResult,
  PricingServiceSlug,
} from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';

export const PRICING = {
  washFoldPerLbCents: 167,
  washFoldMinimumCents: 3000,
  washFoldMinimumThresholdLbs: 18,
  dryCleaningMinimumCents: 3000,
  deliveryFeeCents: 0,
  hangDryCents: 395,
  launderPressCents: 395,
} as const;

export const WASH_FOLD_SPECIALTY_ITEMS = [
  { name: 'Small Comforter', price: '$9.95' },
  { name: 'Large Comforter', price: '$19.95' },
  { name: 'Duvet', price: '$14.95' },
  { name: 'Bathmat', price: '$5.95' },
] as const;

export const DRY_CLEANING_PRICING = [
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
] as const;

const STATIC_PRICING_UPDATED_AT = '2026-01-01T00:00:00.000Z';

const makePricingItem = (
  item: Omit<PricingItemResult, 'metadata'> & {
    metadata?: PricingItemResult['metadata'];
  },
): PricingItemResult => ({
  ...item,
  metadata: item.metadata ?? {},
});

const parseDisplayPriceCents = (price: string): number => {
  const match = price.match(/^\$(\d+)\.(\d{2})(?:\s*\/\s*sqft)?$/);

  if (match === null) {
    throw makeAppError({
      kind: 'InvariantViolationError',
      code: 'invalid_static_pricing_display',
      message: `Invalid pricing display value: ${price}`,
      safeMessage: 'Pricing configuration is invalid.',
      status: 500,
      details: { price },
    });
  }

  const [, dollars, cents] = match;
  return Number(dollars) * 100 + Number(cents);
};

const buildWashFoldStaticCatalog = (): PricingCatalogResult => ({
  serviceSlug: 'wash-fold',
  currency: 'USD',
  updatedAt: STATIC_PRICING_UPDATED_AT,
  items: [
    makePricingItem({
      service: 'wash_fold',
      unit: 'lb',
      category: 'Base',
      name: 'Wash & Fold',
      priceCents: PRICING.washFoldPerLbCents,
      sortOrder: 10,
      metadata: { displayUnitLabel: '/ lb' },
    }),
    makePricingItem({
      service: 'wash_fold',
      unit: 'order',
      category: 'Minimum',
      name: 'Minimum',
      priceCents: PRICING.washFoldMinimumCents,
      sortOrder: 20,
      metadata: {
        minimumThresholdQuantity: PRICING.washFoldMinimumThresholdLbs,
      },
    }),
    makePricingItem({
      service: 'wash_fold',
      unit: 'order',
      category: 'Fee',
      name: 'Delivery Fee',
      priceCents: PRICING.deliveryFeeCents,
      sortOrder: 30,
    }),
    makePricingItem({
      service: 'wash_fold',
      unit: 'item',
      category: 'Other Services',
      name: 'Hang Dry',
      priceCents: PRICING.hangDryCents,
      sortOrder: 40,
    }),
    ...WASH_FOLD_SPECIALTY_ITEMS.map((item, index) =>
      makePricingItem({
        service: 'wash_fold',
        unit: 'item',
        category: 'Specialty',
        name: item.name,
        priceCents: parseDisplayPriceCents(item.price),
        sortOrder: 100 + index * 10,
      }),
    ),
  ],
});

const buildDryCleaningStaticCatalog = (): PricingCatalogResult => ({
  serviceSlug: 'dry-cleaning',
  currency: 'USD',
  updatedAt: STATIC_PRICING_UPDATED_AT,
  items: [
    makePricingItem({
      service: 'dry_cleaning',
      unit: 'order',
      category: 'Minimum',
      name: 'Minimum',
      priceCents: PRICING.dryCleaningMinimumCents,
      sortOrder: 10,
    }),
    makePricingItem({
      service: 'dry_cleaning',
      unit: 'order',
      category: 'Fee',
      name: 'Delivery Fee',
      priceCents: PRICING.deliveryFeeCents,
      sortOrder: 20,
    }),
    makePricingItem({
      service: 'dry_cleaning',
      unit: 'item',
      category: 'Other Services',
      name: 'Launder & Press',
      priceCents: PRICING.launderPressCents,
      sortOrder: 30,
    }),
    ...DRY_CLEANING_PRICING.flatMap((category, categoryIndex) =>
      category.items.map((item, itemIndex) =>
        makePricingItem({
          service: 'dry_cleaning',
          unit: item.price.includes('/sqft') ? 'sqft' : 'item',
          category: category.title,
          name: item.name,
          priceCents: parseDisplayPriceCents(item.price),
          sortOrder: (categoryIndex + 1) * 100 + itemIndex * 10,
        }),
      ),
    ),
  ],
});

export const buildStaticCatalog = (
  serviceSlug: PricingServiceSlug,
): PricingCatalogResult =>
  serviceSlug === 'wash-fold'
    ? buildWashFoldStaticCatalog()
    : buildDryCleaningStaticCatalog();

export const hasRequiredPricing = (catalog: PricingCatalogResult): boolean => {
  if (catalog.serviceSlug === 'wash-fold') {
    return catalog.items.some(
      (item) => item.service === 'wash_fold' && item.category === 'Base',
    );
  }

  return catalog.items.some(
    (item) =>
      item.service === 'dry_cleaning' &&
      item.category !== 'Other Services' &&
      item.category !== 'Minimum' &&
      item.category !== 'Fee',
  );
};
