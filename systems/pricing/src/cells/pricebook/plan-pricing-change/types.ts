import type {
  PricingChangePolicyFailure,
  PricingChangeReadFailure,
} from '../../../model/pricing-change.ts';
import type { CurrentPricingReader } from '../../../postgres/current-pricing.postgres.ts';

export const planPricingChangeOperationId =
  'pricing.plan-pricing-change.v1' as const;

export type PlanPricingChangeExpectedFailure =
  | PricingChangePolicyFailure
  | PricingChangeReadFailure;
export type PlanPricingChangeDependencies = Readonly<{
  loadCurrentPricing: CurrentPricingReader;
}>;
