import {
  allow,
  freshSession,
  hasScopedRole,
  hasAssuranceLevel,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { PricingCatalogResource } from './pricing.resource.ts';

export type PricingPolicyOptions = Readonly<{
  freshSessionMaxAgeMinutes: number;
}>;

export const makePricingPolicies = (
  options: PricingPolicyOptions,
): readonly PolicyRule<PricingCatalogResource>[] => [
  allow({
    id: 'pricing.plan.owner_or_admin_in_scope',
    action: 'pricing:plan',
    when: [hasScopedRole(['owner', 'admin']), hasAssuranceLevel(['mfa'])],
  }),

  allow({
    id: 'pricing.publish.owner_in_scope.fresh_session',
    action: 'pricing:publish',
    when: [
      hasScopedRole(['owner']),
      hasAssuranceLevel(['mfa']),
      freshSession(options.freshSessionMaxAgeMinutes),
    ],
  }),
];
