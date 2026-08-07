import type {
  PricingChangePolicyFailure,
  PricingChangeReadFailure,
} from '../../../foundations/language/pricing-change/pricing-change.failure.ts';

export type PlanPricingChangeFailure =
  | PricingChangePolicyFailure
  | PricingChangeReadFailure;
