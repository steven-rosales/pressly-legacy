import type { Principal } from '../../../authentication/public.ts';
import {
  authorize,
  globalScope,
  type Action,
  type PrincipalAttributes,
  type Role,
  type RoleAssignment,
} from '../../public.ts';
import { describe, expect, it } from 'vitest';
import { makePricingPolicies } from './pricing-authorization.policy.ts';
import type { PricingCatalogResource } from './pricing-resource.value.ts';

const now = new Date('2026-06-22T12:00:00.000Z');

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Admin User',
  sessionIssuedAt: new Date('2026-06-22T11:55:00.000Z'),
};

const pricingResource = (): PricingCatalogResource => ({
  kind: 'pricing.catalog',
  id: 'pricing:wash-fold:global',
  scope: globalScope(),
  attributes: {
    serviceSlug: 'wash-fold',
  },
});

const assignment = (
  role: Role,
  scope: RoleAssignment['scope'] = globalScope(),
): RoleAssignment => ({
  role,
  scope,
  state: 'active',
  version: 1,
});

const decide = (input: {
  action: Action;
  resource?: PricingCatalogResource;
  assignments: readonly RoleAssignment[];
  sessionAgeMinutes?: number;
  identityActive?: boolean;
  assuranceLevel?: 'password' | 'mfa';
}) => {
  const principalAttributes: PrincipalAttributes = {
    assignments: input.assignments,
    identityActive: input.identityActive ?? true,
    assuranceLevel: input.assuranceLevel ?? 'mfa',
  };

  return authorize({
    principal,
    principalAttributes,
    action: input.action,
    resource: input.resource ?? pricingResource(),
    environment: {
      now,
      sessionAgeMinutes: input.sessionAgeMinutes ?? 5,
    },
    policies: makePricingPolicies({ freshSessionMaxAgeMinutes: 15 }),
  });
};

describe('pricing access-control policy', () => {
  it('allows an active MFA-assured owner to plan pricing changes', () => {
    expect(
      decide({
        action: 'pricing:plan',
        assignments: [assignment('owner')],
      }),
    ).toEqual({
      tag: 'allowed',
      policyId: 'pricing.plan.active_owner',
    });
  });

  it('denies planning to managers and inactive owner grants', () => {
    expect(
      decide({
        action: 'pricing:plan',
        assignments: [assignment('manager')],
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
      policyId: 'pricing.plan.active_owner',
    });
    expect(
      decide({
        action: 'pricing:plan',
        assignments: [{ ...assignment('owner'), state: 'revoked' }],
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
    });
  });

  it('allows only owners with a fresh session to publish pricing changes', () => {
    expect(
      decide({
        action: 'pricing:publish',
        assignments: [assignment('owner')],
        sessionAgeMinutes: 10,
      }),
    ).toEqual({
      tag: 'allowed',
      policyId: 'pricing.publish.active_owner.fresh_session',
    });
  });

  it('does not allow managers to publish pricing changes', () => {
    expect(
      decide({
        action: 'pricing:publish',
        assignments: [assignment('manager')],
        sessionAgeMinutes: 10,
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
      policyId: 'pricing.publish.active_owner.fresh_session',
    });
  });

  it('requires a fresh session for publishing', () => {
    expect(
      decide({
        action: 'pricing:publish',
        assignments: [assignment('owner')],
        sessionAgeMinutes: 16,
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'stale_session',
      policyId: 'pricing.publish.active_owner.fresh_session',
    });
  });

  it('denies privileged pricing actions to password-only sessions', () => {
    expect(
      decide({
        action: 'pricing:publish',
        assignments: [assignment('owner')],
        assuranceLevel: 'password',
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'insufficient_assurance',
    });
  });
});
