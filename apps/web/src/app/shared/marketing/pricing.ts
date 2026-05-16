import { cache } from 'react';
import type {
  PricingCatalogResult,
  PricingItemResult,
  PricingParamsRequestSchema,
  PricingServiceSlug,
} from '@pressly/contracts';
import { makeAppError } from '@pressly/errors';

import {
  DRY_CLEANING_PRICING,
  PRICING,
  WASH_FOLD_SPECIALTY_ITEMS,
} from '@/app/shared/marketing/content';
import { loadPricingCatalog } from '@/infra/pricing';

export const formatUsdShortFromCents = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export const formatUsdFromCents = (cents: number) =>
  `$${(cents / 100).toFixed(2)}`;

export const formatQuantity = (value: number) => {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(4);
  return fixed.replace(/\.?0+$/, '');
};

export type PricingSource = 'api' | 'static-fallback';

export type PricingNotice = Readonly<{
  title: string;
  message: string;
  canRetry: boolean;
}>;

export type PricingCatalogViewModel = Readonly<{
  source: PricingSource;
  catalog: PricingCatalogResult;
}>;

export type PricingDisplayItem = Readonly<{
  name: string;
  price: string;
}>;

export type WashFoldPricingModel = Readonly<{
  error?: PricingNotice;
  basePrice?: string;
  specialtyItems: readonly PricingDisplayItem[];
  features: readonly Readonly<{ text: string }>[];
}>;

export type DryCleaningPricingModel = Readonly<{
  error?: PricingNotice;
  minimumPrice?: string;
  previewItems: readonly PricingDisplayItem[];
  categories: readonly Readonly<{
    title: string;
    items: readonly PricingDisplayItem[];
  }>[];
}>;

const STATIC_PRICING_UPDATED_AT = '2026-01-01T00:00:00.000Z';

const PRICING_FEATURES = [
  { text: 'Pickup & Delivery Available' },
  { text: 'Cleaned to your preferences' },
  { text: 'Next-day turnaround' },
  { text: 'Professional folding' },
] as const;

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

const buildWashFoldStaticCatalog = (
  locationSlug?: string,
): PricingCatalogResult => ({
  serviceSlug: 'wash-fold',
  ...(locationSlug === undefined ? {} : { locationSlug }),
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

const buildDryCleaningStaticCatalog = (
  locationSlug?: string,
): PricingCatalogResult => ({
  serviceSlug: 'dry-cleaning',
  ...(locationSlug === undefined ? {} : { locationSlug }),
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

const buildStaticCatalog = (
  serviceSlug: PricingServiceSlug,
  locationSlug?: string,
): PricingCatalogResult =>
  serviceSlug === 'wash-fold'
    ? buildWashFoldStaticCatalog(locationSlug)
    : buildDryCleaningStaticCatalog(locationSlug);

const hasRequiredPricing = (catalog: PricingCatalogResult): boolean => {
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

const loadCachedPricingCatalogViewModel = cache(
  async (
    serviceSlug: PricingServiceSlug,
    locationSlug?: string,
  ): Promise<PricingCatalogViewModel> => {
    const input: PricingParamsRequestSchema =
      locationSlug === undefined
        ? { serviceSlug }
        : { serviceSlug, locationSlug };
    const pricing = await loadPricingCatalog(input);

    if (pricing.ok && hasRequiredPricing(pricing.value))
      return {
        source: 'api',
        catalog: pricing.value,
      };

    return {
      source: 'static-fallback',
      catalog: buildStaticCatalog(serviceSlug, locationSlug),
    };
  },
);

export async function loadPricingCatalogViewModel(
  input: PricingParamsRequestSchema,
): Promise<PricingCatalogViewModel> {
  return loadCachedPricingCatalogViewModel(input.serviceSlug, input.locationSlug);
}

export const selectItemsByCategory = (
  catalog: PricingCatalogResult,
  category: string,
): PricingItemResult[] =>
  catalog.items
    .filter((item) => item.category === category)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

const toPriceLabel = (item: PricingItemResult): string => {
  const base = formatUsdFromCents(item.priceCents);
  return item.unit === 'sqft' ? `${base} /sqft` : base;
};

const selectDryCleaningCategories = (
  catalog: PricingCatalogResult,
): DryCleaningPricingModel['categories'] => {
  const items = catalog.items
    .filter((item) => item.service === 'dry_cleaning')
    .filter((item) => item.category !== 'Other Services')
    .filter((item) => item.category !== 'Minimum')
    .filter((item) => item.category !== 'Fee')
    .slice()
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });

  const categories = new Map<string, PricingDisplayItem[]>();

  for (const item of items) {
    const bucket = categories.get(item.category) ?? [];
    bucket.push({ name: item.name, price: toPriceLabel(item) });
    categories.set(item.category, bucket);
  }

  return [...categories.entries()].map(([title, items]) => ({
    title,
    items,
  }));
};

export async function loadWashFoldPricingViewModel(
  input: { locationSlug?: string } = {},
): Promise<WashFoldPricingModel> {
  const pricing = await loadPricingCatalogViewModel({
    serviceSlug: 'wash-fold',
    ...(input.locationSlug === undefined
      ? {}
      : { locationSlug: input.locationSlug }),
  });

  const baseItem = selectItemsByCategory(pricing.catalog, 'Base')[0];

  return {
    ...(baseItem === undefined
      ? {
          error: {
            title: 'Pricing unavailable',
            message: 'Base wash and fold pricing is missing.',
            canRetry: true,
          },
        }
      : { basePrice: formatUsdFromCents(baseItem.priceCents) }),
    specialtyItems: selectItemsByCategory(pricing.catalog, 'Specialty').map(
      (item) => ({
        name: item.name,
        price: formatUsdFromCents(item.priceCents),
      }),
    ),
    features: PRICING_FEATURES,
  };
}

export async function loadDryCleaningPricingViewModel(
  input: { locationSlug?: string } = {},
): Promise<DryCleaningPricingModel> {
  const pricing = await loadPricingCatalogViewModel({
    serviceSlug: 'dry-cleaning',
    ...(input.locationSlug === undefined
      ? {}
      : { locationSlug: input.locationSlug }),
  });

  const categories = selectDryCleaningCategories(pricing.catalog);
  const previewItems = categories.flatMap((category) => category.items).slice(0, 5);
  const minimumItem = selectItemsByCategory(pricing.catalog, 'Minimum')[0];

  return {
    ...(categories.length === 0
      ? {
          error: {
            title: 'Pricing unavailable',
            message: 'Dry cleaning pricing is missing.',
            canRetry: true,
          },
        }
      : {}),
    ...(minimumItem === undefined
      ? {}
      : { minimumPrice: formatUsdFromCents(minimumItem.priceCents) }),
    previewItems,
    categories,
  };
}
