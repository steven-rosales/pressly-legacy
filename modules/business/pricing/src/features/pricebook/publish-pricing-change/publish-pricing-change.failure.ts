import type {
  PricingChangeCommitFailure,
  PricingChangePolicyFailure,
} from '../../../foundations/language/pricing-change/pricing-change.failure.ts';

export type PublishPricingChangeFailure =
  | PricingChangePolicyFailure
  | PricingChangeCommitFailure;
