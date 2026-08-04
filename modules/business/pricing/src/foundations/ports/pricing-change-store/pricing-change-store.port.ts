import type { Result } from '@pressly/kernel';
import type {
  PricingChangeCommitFailure,
  PricingChangeReadFailure,
} from '../../language/pricing-change/pricing-change.failure.ts';
import type {
  CurrentPricing,
  PricingChangeCommand,
  PricingChangePlan,
  PublishedPricingChange,
} from '../../language/pricing-change/pricing-change.model.ts';

export type LoadCurrentPricingInput = Readonly<{
  serviceSlug: PricingChangeCommand['serviceSlug'];
}>;

export type CommitPricingChangeInput = Readonly<{
  command: PricingChangeCommand;
  plan: PricingChangePlan;
  publishedAt: Date;
}>;

export type PricingChangeStore = Readonly<{
  loadCurrentPricing: (
    input: LoadCurrentPricingInput,
  ) => Promise<Result<CurrentPricing, PricingChangeReadFailure>>;
  commitPricingChange: (
    input: CommitPricingChangeInput,
  ) => Promise<Result<PublishedPricingChange, PricingChangeCommitFailure>>;
}>;
