import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeItem,
  PublishPricingChangeResult,
} from '@pressly/contracts';
import type { AppError, Result } from '@pressly/errors';

export type PricingChangeInput = Readonly<{
  serviceSlug: LoadPricingCatalogCommand['serviceSlug'];
  locationSlug?: string;
  reason: string;
  items: readonly PublishPricingChangeItem[];
}>;

export type PricingAdminClient = Readonly<{
  loadCatalog: (
    command: LoadPricingCatalogCommand,
  ) => Promise<Result<LoadPricingCatalogResult, AppError>>;
  planChange: (
    command: PricingChangeInput,
  ) => Promise<Result<PricingChangePlan, AppError>>;
  publishChange: (
    command: PricingChangeInput,
  ) => Promise<Result<PublishPricingChangeResult, AppError>>;
  close: () => Promise<void>;
}>;
