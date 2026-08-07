import type { Result } from '@pressly/kernel';
import type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeItem,
  PublishPricingChangeResult,
} from '@pressly/contracts/pricing';
import type { AppError } from '@pressly/errors/app-error';

export type PricingChangeInput = Readonly<{
  serviceSlug: LoadPricingCatalogCommand['serviceSlug'];
  reason: string;
  items: readonly PublishPricingChangeItem[];
}>;

export type PricingClient = Readonly<{
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
