import type { PrincipalAttributes } from '../principal-attributes.ts';
import type { PolicyCondition } from '../policy.ts';
import type { AuthResource } from '../resource.ts';

export const hasAssuranceLevel = <R extends AuthResource>(
  allowed: readonly NonNullable<PrincipalAttributes['assuranceLevel']>[],
): PolicyCondition<R> => ({
  name: 'has_assurance_level',
  denyReason: 'insufficient_assurance',
  safeMessage: 'Multi-factor authentication is required for this action.',
  evaluate: ({ principalAttributes }) =>
    principalAttributes.assuranceLevel !== undefined &&
    allowed.includes(principalAttributes.assuranceLevel),
});
