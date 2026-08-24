import {
  allow,
  freshSession,
  hasActiveRole,
  hasAssuranceLevel,
  type PolicyRule,
} from '../../public.ts';
import type { PricingCatalogResource } from './pricing-resource.value.ts';

export type PricingPolicyOptions = Readonly<{
  freshSessionMaxAgeMinutes: number;
}>;

export const makePricingPolicies = (
  options: PricingPolicyOptions,
): readonly PolicyRule<PricingCatalogResource>[] => [
  allow({
    id: 'pricing.plan.active_owner',
    action: 'pricing:plan',
    when: [hasActiveRole(['owner']), hasAssuranceLevel(['mfa'])],
  }),

  allow({
    id: 'pricing.publish.active_owner.fresh_session',
    action: 'pricing:publish',
    when: [
      hasActiveRole(['owner']),
      hasAssuranceLevel(['mfa']),
      freshSession(options.freshSessionMaxAgeMinutes),
    ],
  }),
];
