import type { PricingServiceSlug } from '../pricing/pricing.value.ts';

export type PricingPolicyViolation = Readonly<
  | {
      code: 'pricing_change_reason_too_short';
      minimumLength: number;
      actualLength: number;
    }
  | {
      code: 'duplicate_pricing_item_code';
      itemCode: string;
    }
  | {
      code: 'invalid_pricing_item_price';
      itemCode: string;
      priceCents: number;
    }
  | {
      code: 'pricing_item_code_not_found';
      itemCode: string;
    }
  | {
      code: 'pricing_change_has_no_changes';
    }
>;

export type PricingChangePolicyFailure = Readonly<{
  code: PricingPolicyViolation['code'];
  violations: readonly [PricingPolicyViolation, ...PricingPolicyViolation[]];
}>;

export type PricingChangeReadFailure = Readonly<
  | {
      code: 'pricing_service_not_found';
      serviceSlug: PricingServiceSlug;
    }
  | {
      code: 'active_pricing_set_not_found';
      serviceSlug: PricingServiceSlug;
    }
  | {
      code: 'multiple_active_pricing_sets';
      serviceSlug: PricingServiceSlug;
    }
  | {
      code: 'active_pricing_set_has_no_items';
      pricingSetId: string;
    }
>;

export type PricingChangeCommitFailure =
  | PricingChangeReadFailure
  | Readonly<{
      code: 'pricing_state_changed';
      expectedPricingSetId: string;
      actualPricingSetId: string;
    }>;

export type PricingChangeFailure =
  | PricingChangePolicyFailure
  | PricingChangeCommitFailure;
