import type { Principal } from '@pressly/auth/authentication';
import {
  authorize,
  globalScope,
  locationScope,
  type Role,
} from '@pressly/auth/authorization';
import { describe, expect, it } from 'vitest';
import { makeOrderManagementPolicies } from '../../src/order-management/order-management.policy.ts';
import {
  orderManagementLocationResource,
  orderManagementUsersResource,
} from '../../src/order-management/order-management.resource.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Order manager',
};

const attributes = (role: Role, scope: ReturnType<typeof locationScope>) => ({
  assignments: [{ role, scope }],
  identityActive: true,
  assuranceLevel: 'password' as const,
});

describe('order-management access-control policy', () => {
  it.each(['owner', 'admin'] as const)(
    'allows %s to mutate Orders only inside the assigned location',
    (role) => {
      const allowed = authorize({
        principal,
        principalAttributes: attributes(role, locationScope('east')),
        action: 'order-management:order:write',
        resource: orderManagementLocationResource('east'),
        environment: { now: new Date('2026-07-21T20:00:00.000Z') },
        policies: makeOrderManagementPolicies(),
      });
      const denied = authorize({
        principal,
        principalAttributes: attributes(role, locationScope('west')),
        action: 'order-management:order:write',
        resource: orderManagementLocationResource('east'),
        environment: { now: new Date('2026-07-21T20:00:00.000Z') },
        policies: makeOrderManagementPolicies(),
      });

      expect(allowed).toMatchObject({ tag: 'allowed' });
      expect(denied).toMatchObject({
        tag: 'denied',
        reason: 'missing_assignment',
      });
    },
  );

  it('requires global owner or admin scope for canonical User mutations', () => {
    const global = authorize({
      principal,
      principalAttributes: attributes('admin', globalScope()),
      action: 'order-management:user:write',
      resource: orderManagementUsersResource(),
      environment: { now: new Date('2026-07-21T20:00:00.000Z') },
      policies: makeOrderManagementPolicies(),
    });
    const locationOnly = authorize({
      principal,
      principalAttributes: attributes('admin', locationScope('east')),
      action: 'order-management:user:write',
      resource: orderManagementUsersResource(),
      environment: { now: new Date('2026-07-21T20:00:00.000Z') },
      policies: makeOrderManagementPolicies(),
    });

    expect(global).toMatchObject({ tag: 'allowed' });
    expect(locationOnly).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
    });
  });

  it('does not grant canonical mutations to production operators', () => {
    const decision = authorize({
      principal,
      principalAttributes: attributes('operator', locationScope('east')),
      action: 'order-management:order:write',
      resource: orderManagementLocationResource('east'),
      environment: { now: new Date('2026-07-21T20:00:00.000Z') },
      policies: makeOrderManagementPolicies(),
    });

    expect(decision).toMatchObject({ tag: 'denied' });
  });
});
