import type {
  PricingCatalogResult,
  PricingParamsRequestSchema,
} from '@pressly/contracts/pricing';

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

export type DeliveryFeePricingModel = Readonly<{
  title: string;
  price: string;
  shortCopy: string;
  copy: string;
}>;

export type WashFoldPricingModel = Readonly<{
  error?: PricingNotice;
  basePrice?: string;
  deliveryFee: DeliveryFeePricingModel;
  hangDryPrice?: string;
  minimumPrice?: string;
  minimumThresholdQuantity?: number;
  specialtyItems: readonly PricingDisplayItem[];
  features: readonly Readonly<{ text: string }>[];
}>;

export type DryCleaningPricingModel = Readonly<{
  error?: PricingNotice;
  deliveryFee: DeliveryFeePricingModel;
  launderPressPrice?: string;
  minimumPrice?: string;
  previewItems: readonly PricingDisplayItem[];
  categories: readonly Readonly<{
    title: string;
    items: readonly PricingDisplayItem[];
  }>[];
}>;

export type PricingCatalogLoader = (
  input: PricingParamsRequestSchema,
) => Promise<PricingCatalogViewModel>;
