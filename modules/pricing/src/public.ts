export { makePricingModule } from './main.ts';
export { makePostgresPricingChangeStore } from './adapters/publish-pricing/persistence/publish-pricing-change.repo.ts';
export { renderPricingChangePlan } from './adapters/publish-pricing/http/publish-pricing-change.diff.ts';
export { makePublishPricingChange } from './features/publish-pricing/publish-pricing-change.usecase.ts';

export type { PricingModuleDeps } from './main.ts';
export type {
  CommitPricingChangePlanInput,
  CurrentPricingForPublish,
  LoadCurrentPricingForPublishInput,
  PricingChangeStore,
} from './features/publish-pricing/publish-pricing-change.port.ts';
export type { PublishPricingChange } from './features/publish-pricing/publish-pricing-change.usecase.ts';
export type {
  LoadPricingCatalogCommand,
  LoadPricingCatalogResult,
  PricingChangePlan,
  PublishPricingChangeCommand,
  PublishPricingChangeResult,
} from '@pressly/contracts';
