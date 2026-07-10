import type { Principal } from '@pressly/auth/authentication';
import {
  authorize,
  globalScope,
  resourceScope,
  type Action,
  type PrincipalAttributes,
  type Role,
  type RoleAssignment,
} from '@pressly/auth/authorization';
import { describe, expect, it } from 'vitest';
import { makePricingPolicies } from '../../src/pricing/pricing.policy.ts';
import type { PricingCatalogResource } from '../../src/pricing/pricing.resource.ts';

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
  it('allows owners and admins to plan pricing changes in scope', () => {
    expect(
      decide({
        action: 'pricing:plan',
        assignments: [assignment('admin')],
      }),
    ).toEqual({
      tag: 'allowed',
      policyId: 'pricing.plan.owner_or_admin_in_scope',
    });

    expect(
      decide({
        action: 'pricing:plan',
        assignments: [assignment('owner')],
      }),
    ).toEqual({
      tag: 'allowed',
      policyId: 'pricing.plan.owner_or_admin_in_scope',
    });
  });

  it('denies planning when the assignment scope does not cover the resource', () => {
    expect(
      decide({
        action: 'pricing:plan',
        assignments: [
          assignment(
            'admin',
            resourceScope('pricing.catalog', 'pricing:dry-cleaning:global'),
          ),
        ],
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
      policyId: 'pricing.plan.owner_or_admin_in_scope',
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
      policyId: 'pricing.publish.owner_in_scope.fresh_session',
    });
  });

  it('does not allow admins to publish pricing changes', () => {
    expect(
      decide({
        action: 'pricing:publish',
        assignments: [assignment('admin')],
        sessionAgeMinutes: 10,
      }),
    ).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
      policyId: 'pricing.publish.owner_in_scope.fresh_session',
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
      policyId: 'pricing.publish.owner_in_scope.fresh_session',
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
