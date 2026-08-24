export const pricingServiceSlugs = ['wash-fold', 'dry-cleaning'] as const;

export type PricingServiceSlug = (typeof pricingServiceSlugs)[number];

export type PricingItemMetadata = Readonly<{
  minimumThresholdQuantity?: number;
  displayUnitLabel?: string;
}>;

export type PricingItem = Readonly<{
  service: string;
  unit: string;
  category: string;
  name: string;
  priceCents: number;
  sortOrder: number;
  metadata: PricingItemMetadata;
}>;

export type PricingCatalog = Readonly<{
  serviceSlug: PricingServiceSlug;
  currency: string;
  items: readonly PricingItem[];
  updatedAt: Date;
}>;
