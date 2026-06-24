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

const facilityResource = (locationId: string): AuthResource => ({
  kind: 'facility.operations',
  scope: locationScope(locationId),
  id: `facility:${locationId}:operations`,
  attributes: { locationId },
});

const manageFacilityAction = 'auth:user:manage';
const revokeSessionAction = 'auth:session:revoke';

describe('allow and deny policy builders', () => {
  it('builds immutable policy rules', () => {
    const condition = hasScopedRole(['owner']);
    const allowRule = allow({
      id: 'facility.manage.owner',
      action: manageFacilityAction,
      when: [condition],
    });
    const denyRule = deny({
      id: 'facility.manage.blocked',
      action: manageFacilityAction,
      when: [condition],
    });

    expect(allowRule).toEqual({
      id: 'facility.manage.owner',
      action: manageFacilityAction,
      effect: 'allow',
      conditions: [condition],
    });
    expect(denyRule).toEqual({
      id: 'facility.manage.blocked',
      action: manageFacilityAction,
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
      action: manageFacilityAction,
      resource: facilityResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'facility.manage.owner',
          action: manageFacilityAction,
          when: [hasScopedRole(['owner'])],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'allowed',
      policyId: 'facility.manage.owner',
    });
  });

  it('denies inactive principals before evaluating policies', () => {
    const condition = vi.fn(() => true);

    const decision = authorize({
      principal,
      principalAttributes: attributes([], { identityActive: false }),
      action: manageFacilityAction,
      resource: facilityResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'facility.manage.owner',
          action: manageFacilityAction,
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
      action: manageFacilityAction,
      resource: facilityResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'facility.manage.owner',
          action: manageFacilityAction,
          when: [hasScopedRole(['owner'])],
        }),
        deny({
          id: 'facility.manage.freeze',
          action: manageFacilityAction,
          when: [
            {
              name: 'facility_freeze',
              denyReason: 'policy_denied',
              safeMessage: 'Facility updates are frozen.',
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
      policyId: 'facility.manage.freeze',
    });
  });

  it('preserves the first failed allow condition reason', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: locationScope('hoboken') },
      ]),
      action: manageFacilityAction,
      resource: facilityResource('jersey-city'),
      environment: { now },
      policies: [
        allow({
          id: 'facility.manage.owner',
          action: manageFacilityAction,
          when: [hasScopedRole(['owner'])],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'missing_assignment',
      safeMessage: 'You do not have permission to perform this action.',
      policyId: 'facility.manage.owner',
      details: { condition: 'has_scope_role' },
    });
  });

  it('denies by default when no action candidate exists', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes([
        { role: 'owner', scope: globalScope() },
      ]),
      action: revokeSessionAction,
      resource: facilityResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'facility.manage.owner',
          action: manageFacilityAction,
          when: [hasScopedRole(['owner'])],
        }),
      ],
    });

    expect(decision).toEqual({
      tag: 'denied',
      reason: 'missing_assignment',
      safeMessage: 'You do not have permission to perform this action.',
      details: {
        action: revokeSessionAction,
        resource: 'facility.operations',
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
    const resource = facilityResource('hoboken');
    const environment = { now, sessionAgeMinutes: 3 };

    authorize({
      principal,
      principalAttributes,
      action: manageFacilityAction,
      resource,
      environment,
      policies: [
        allow({
          id: 'facility.manage.capture',
          action: manageFacilityAction,
          when: [condition],
        }),
      ],
    });

    expect(seen).toEqual([
      {
        principal,
        principalAttributes,
        action: manageFacilityAction,
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
      action: manageFacilityAction,
      resource: facilityResource('hoboken'),
      environment: { now },
      policies: [
        allow({
          id: 'facility.manage.owner',
          action: manageFacilityAction,
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
