import type { Result } from '@pressly/kernel';
import type { PricingChangeReadFailure } from '../../language/pricing-change/pricing-change.failure.ts';
import type {
  CurrentPricing,
  PricingChangeCommand,
} from '../../language/pricing-change/pricing-change.model.ts';

export type LoadCurrentPricingInput = Readonly<{
  serviceSlug: PricingChangeCommand['serviceSlug'];
}>;

export type CurrentPricingReader = (
  input: LoadCurrentPricingInput,
) => Promise<Result<CurrentPricing, PricingChangeReadFailure>>;
