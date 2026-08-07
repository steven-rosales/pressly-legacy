import type {
  PricingCatalogResult,
  PricingItemResult,
} from '@pressly/contracts/pricing';

import type {
  DeliveryFeePricingModel,
  DryCleaningPricingModel,
  PricingDisplayItem,
  WashFoldPricingModel,
} from './model';
import { PRICING } from './static-catalog';

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const formatUsdShort = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : formatUsd(cents);

export const formatDeliveryFeeShortCopy = (cents: number) =>
  cents === 0 ? 'free delivery' : `${formatUsdShort(cents)} delivery fee`;

export const formatDeliveryFeeCopy = (cents: number) =>
  cents === 0
    ? 'Pickup and delivery are free per order.'
    : `Pickup and delivery are handled through a ${formatDeliveryFeeShortCopy(cents)} per order.`;

export const DELIVERY_FEE_LABEL = 'Delivery Fee';
export const DELIVERY_FEE_SHORT_COPY = formatDeliveryFeeShortCopy(
  PRICING.deliveryFeeCents,
);
export const DELIVERY_FEE_COPY = formatDeliveryFeeCopy(
  PRICING.deliveryFeeCents,
);

const PRICING_FEATURES = [
  { text: 'Pickup & Delivery Available' },
  { text: 'Cleaned to your preferences' },
  { text: 'Next-day turnaround' },
  { text: 'Professional folding' },
] as const;

export const selectItemsByCategory = (
  catalog: PricingCatalogResult,
  category: string,
): PricingItemResult[] =>
  catalog.items
    .filter((item) => item.category === category)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

const selectItem = (
  catalog: PricingCatalogResult,
  input: Readonly<{ category: string; name?: string }>,
): PricingItemResult | undefined =>
  selectItemsByCategory(catalog, input.category).find(
    (item) => input.name === undefined || item.name === input.name,
  );

const toPriceLabel = (item: PricingItemResult): string => {
  const base = formatUsd(item.priceCents);
  return item.unit === 'sqft' ? `${base} /sqft` : base;
};

const toDeliveryFeeModel = (
  catalog: PricingCatalogResult,
): DeliveryFeePricingModel => {
  const item = selectItem(catalog, {
    category: 'Fee',
    name: DELIVERY_FEE_LABEL,
  });
  const priceCents = item?.priceCents ?? PRICING.deliveryFeeCents;
  const price = priceCents === 0 ? 'Free' : formatUsdShort(priceCents);
  const shortCopy = formatDeliveryFeeShortCopy(priceCents);

  return {
    title: DELIVERY_FEE_LABEL,
    price,
    shortCopy,
    copy: formatDeliveryFeeCopy(priceCents),
  };
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

export const toWashFoldPricingModel = (
  catalog: PricingCatalogResult,
): WashFoldPricingModel => {
  const baseItem = selectItemsByCategory(catalog, 'Base')[0];
  const minimumItem = selectItem(catalog, { category: 'Minimum' });
  const hangDryItem = selectItem(catalog, {
    category: 'Other Services',
    name: 'Hang Dry',
  });

  return {
    ...(baseItem === undefined
      ? {
          error: {
            title: 'Pricing unavailable',
            message: 'Base wash and fold pricing is missing.',
            canRetry: true,
          },
        }
      : { basePrice: formatUsd(baseItem.priceCents) }),
    deliveryFee: toDeliveryFeeModel(catalog),
    ...(hangDryItem === undefined
      ? {}
      : { hangDryPrice: formatUsd(hangDryItem.priceCents) }),
    ...(minimumItem === undefined
      ? {}
      : {
          minimumPrice: formatUsdShort(minimumItem.priceCents),
          ...(minimumItem.metadata.minimumThresholdQuantity === undefined
            ? {}
            : {
                minimumThresholdQuantity:
                  minimumItem.metadata.minimumThresholdQuantity,
              }),
        }),
    specialtyItems: selectItemsByCategory(catalog, 'Specialty').map((item) => ({
      name: item.name,
      price: formatUsd(item.priceCents),
    })),
    features: PRICING_FEATURES,
  };
};

export const toDryCleaningPricingModel = (
  catalog: PricingCatalogResult,
): DryCleaningPricingModel => {
  const categories = selectDryCleaningCategories(catalog);
  const previewItems = categories
    .flatMap((category) => category.items)
    .slice(0, 5);
  const minimumItem = selectItemsByCategory(catalog, 'Minimum')[0];
  const launderPressItem = selectItem(catalog, {
    category: 'Other Services',
    name: 'Launder & Press',
  });

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
    deliveryFee: toDeliveryFeeModel(catalog),
    ...(launderPressItem === undefined
      ? {}
      : {
          launderPressPrice: formatUsd(launderPressItem.priceCents),
        }),
    ...(minimumItem === undefined
      ? {}
      : { minimumPrice: formatUsd(minimumItem.priceCents) }),
    previewItems,
    categories,
  };
};
