import { describe, expect, it, vi } from 'vitest';

import {
  allow,
  authorize,
  deny,
  globalScope,
  hasScopedRole,
  locationScope,
  type AuthResource,
  type PolicyCondition,
  type PrincipalAttributes,
} from '../../src/authorization/index.ts';
import type { Principal } from '../../src/authentication/index.ts';

const now = new Date('2026-06-21T12:00:00.000Z');

const principal: Principal = {
  identityId: 'identity_1',
  kind: 'human',
  displayName: 'Steven',
};

const attributes = (
  assignments: PrincipalAttributes['assignments'],
  input: Partial<PrincipalAttributes> = {},
): PrincipalAttributes => ({
  assignments,
  identityActive: input.identityActive ?? true,
  ...(input.assuranceLevel === undefined
    ? {}
    : { assuranceLevel: input.assuranceLevel }),
});

const pricingResource = (locationSlug: string): AuthResource => ({
  kind: 'pricing.catalog',
  scope: locationScope(locationSlug),
  id: `pricing:wash-fold:location:${locationSlug}`,
  attributes: { serviceSlug: 'wash-fold', locationSlug },
});

describe('allow and deny policy builders', () => {
  it('builds immutable policy rules', () => {
    const condition = hasScopedRole(['owner']);
    const allowRule = allow({
      id: 'pricing.publish.owner',
      action: 'pricing:publish',
      when: [condition],
    });
    const denyRule = deny({
      id: 'pricing.publish.blocked',
      action: 'pricing:publish',
      when: [condition],
    });

    expect(allowRule).toEqual({
      id: 'pricing.publish.owner',
      action: 'pricing:publish',
      effect: 'allow',
      conditions: [condition],
    });
    expect(denyRule).toEqual({
      id: 'pricing.publish.blocked',
      action: 'pricing:publish',
      effect: 'deny',
      conditions: [condition],
    });
  });
});

describe('authorize', () => {
  it('allows when an allow policy action and conditions match', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: locationScope('hoboken') },
      ]),
      action: 'pricing:publish',
      resource: pricingResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'pricing.publish.owner',
          action: 'pricing:publish',
          when: [hasScopedRole(['owner'])],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'allowed',
      policyId: 'pricing.publish.owner',
    });
  });

  it('denies inactive principals before evaluating policies', () => {
    const condition = vi.fn(() => true);

    const decision = authorize({
      principal,
      principalAttributes: attributes([], { identityActive: false }),
      action: 'pricing:publish',
      resource: pricingResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'pricing.publish.owner',
          action: 'pricing:publish',
          when: [
            {
              name: 'should_not_run',
              denyReason: 'missing_context',
              safeMessage: 'Should not run.',
              evaluate: condition,
            },
          ],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'inactive_identity',
      safeMessage: 'Your account is not active.',
      details: { identityId: 'identity_1' },
    });
    expect(condition).not.toHaveBeenCalled();
  });

  it('lets deny policies take precedence over matching allow policies', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: globalScope() },
      ]),
      action: 'pricing:publish',
      resource: pricingResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'pricing.publish.owner',
          action: 'pricing:publish',
          when: [hasScopedRole(['owner'])],
        }),
        deny({
          id: 'pricing.publish.freeze',
          action: 'pricing:publish',
          when: [
            {
              name: 'pricing_freeze',
              denyReason: 'policy_denied',
              safeMessage: 'Pricing changes are frozen.',
              evaluate: () => true,
            },
          ],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'policy_denied',
      safeMessage: 'You do not have permission to perform this action.',
      policyId: 'pricing.publish.freeze',
    });
  });

  it('preserves the first failed allow condition reason', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: locationScope('hoboken') },
      ]),
      action: 'pricing:publish',
      resource: pricingResource('jersey-city'),
      environment: { now },
      policies: [
        allow({
          id: 'pricing.publish.owner',
          action: 'pricing:publish',
          when: [hasScopedRole(['owner'])],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'missing_assignment',
      safeMessage: 'You do not have permission to perform this action.',
      policyId: 'pricing.publish.owner',
      details: { condition: 'has_scope_role' },
    });
  });

  it('denies by default when no action candidate exists', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: globalScope() },
      ]),
      action: 'pricing:rollback',
      resource: pricingResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'pricing.publish.owner',
          action: 'pricing:publish',
          when: [hasScopedRole(['owner'])],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'missing_assignment',
      safeMessage: 'You do not have permission to perform this action.',
      details: {
        action: 'pricing:rollback',
        resource: 'pricing.catalog',
        scope: locationScope('hoboken'),
      },
    });
  });

  it('passes principal, attributes, action, resource, and environment to conditions', () => {
    const seen: unknown[] = [];
    const condition: PolicyCondition = {
      name: 'capture',
      denyReason: 'missing_context',
      safeMessage: 'Missing context.',
      evaluate: (input) => {
        seen.push(input);
        return true;
      },
    };

    const principalAttributes = attributes([
      { role: 'owner', scope: globalScope() },
    ]);
    const resource = pricingResource('hoboken');
    const environment = { now, sessionAgeMinutes: 3 };

    authorize({
      principal,
      principalAttributes,
      action: 'pricing:publish',
      resource,
      environment,
      policies: [
        allow({
          id: 'pricing.publish.capture',
          action: 'pricing:publish',
          when: [condition],
        }),
      ],
    });

    expect(seen).toEqual([
      {
        principal,
        principalAttributes,
        action: 'pricing:publish',
        resource,
        environment,
      },
    ]);
  });

  it('short-circuits condition evaluation on first failure', () => {
    const first = vi.fn(() => false);
    const second = vi.fn(() => true);

    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: globalScope() },
      ]),
      action: 'pricing:publish',
      resource: pricingResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'pricing.publish.owner',
          action: 'pricing:publish',
          when: [
            {
              name: 'first',
              denyReason: 'missing_context',
              safeMessage: 'First failed.',
              evaluate: first,
            },
            {
              name: 'second',
              denyReason: 'policy_denied',
              safeMessage: 'Second failed.',
              evaluate: second,
            },
          ],
        }),
      ],
    });

    expect(decision).toMatchObject({
      tag: 'denied',
      reason: 'missing_context',
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});
