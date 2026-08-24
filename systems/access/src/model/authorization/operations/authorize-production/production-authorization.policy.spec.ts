import type { Principal } from '../../../authentication/public.ts';
import {
  authorize,
  businessScope,
  globalScope,
  locationScope,
  type Action,
  type Role,
  type Scope,
} from '../../public.ts';
import { describe, expect, it } from 'vitest';
import {
  makeProductionPolicies,
  productionCapabilitiesForLocation,
} from './production-authorization.policy.ts';
import {
  productionLocationResource,
  productionOperationsResource,
} from './production-resource.value.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Floor operator',
};

const activeAssignment = (role: Role, scope: Scope) => ({
  role,
  scope,
  state: 'active' as const,
  version: 1,
});

const decide = (input: {
  action: Action;
  role?: Role;
  assignmentLocation?: string;
  identityActive?: boolean;
}) =>
  authorize({
    principal,
    principalAttributes: {
      assignments:
        input.role === undefined
          ? []
          : [
              activeAssignment(
                input.role,
                locationScope(input.assignmentLocation ?? 'location-1'),
              ),
            ],
      identityActive: input.identityActive ?? true,
      assuranceLevel: 'password',
    },
    action: input.action,
    resource: productionLocationResource('location-1', 'business-1'),
    environment: { now: new Date('2026-07-10T14:00:00.000Z') },
    policies: makeProductionPolicies(),
  });

describe('production access-control policy', () => {
  it.each(['owner', 'manager'] as const)(
    'allows %s to perform every production action in scope',
    (role) => {
      for (const action of [
        'production:read',
        'production:schedule',
        'production:accept',
        'production:start',
        'production:queue',
        'production:override',
        'production:priority',
        'production:intake',
        'production:admission',
        'production:stage',
      ] as const)
        expect(decide({ action, role })).toMatchObject({ tag: 'allowed' });
    },
  );

  it('limits operators to floor actions', () => {
    for (const action of [
      'production:read',
      'production:priority',
      'production:intake',
      'production:admission',
      'production:stage',
      'production:queue',
    ] as const)
      expect(decide({ action, role: 'operator' })).toMatchObject({
        tag: 'allowed',
      });

    for (const action of [
      'production:schedule',
      'production:accept',
      'production:start',
      'production:override',
      'production:resources',
    ] as const)
      expect(decide({ action, role: 'operator' })).toMatchObject({
        tag: 'denied',
      });
  });

  it('denies missing roles, wrong scope, and inactive identities', () => {
    expect(decide({ action: 'production:read' })).toMatchObject({
      tag: 'denied',
    });
    expect(
      decide({
        action: 'production:stage',
        role: 'operator',
        assignmentLocation: 'location-2',
      }),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
    expect(
      decide({
        action: 'production:schedule',
        role: 'owner',
        identityActive: false,
      }),
    ).toMatchObject({ tag: 'denied', reason: 'inactive_identity' });
  });

  it('allows business roles only for locations with matching canonical ancestry', () => {
    const decideBusiness = (businessId: string, resourceBusinessId: string) =>
      authorize({
        principal,
        principalAttributes: {
          assignments: [activeAssignment('manager', businessScope(businessId))],
          identityActive: true,
          assuranceLevel: 'mfa',
        },
        action: 'production:read',
        resource: productionLocationResource('location-1', resourceBusinessId),
        environment: { now: new Date('2026-07-10T14:00:00.000Z') },
        policies: makeProductionPolicies(),
      });

    expect(decideBusiness('business-1', 'business-1')).toMatchObject({
      tag: 'allowed',
    });
    expect(decideBusiness('business-2', 'business-1')).toMatchObject({
      tag: 'denied',
      reason: 'missing_assignment',
    });
  });

  it('projects capabilities from the same exact-location policy used by API guards', () => {
    const capabilities = productionCapabilitiesForLocation({
      principal,
      principalAttributes: {
        assignments: [
          activeAssignment('manager', locationScope('location-1')),
          activeAssignment('owner', locationScope('location-2')),
        ],
        identityActive: true,
        assuranceLevel: 'mfa',
      },
      locationId: 'location-1',
      businessId: 'business-1',
      now: new Date('2026-07-10T14:00:00.000Z'),
    });

    expect(capabilities).toContain('production:read');
    expect(capabilities).toContain('production:override');
    expect(capabilities).not.toContain('production:resources');
    expect(
      productionCapabilitiesForLocation({
        principal,
        principalAttributes: {
          assignments: [
            activeAssignment('manager', locationScope('location-2')),
          ],
          identityActive: true,
          assuranceLevel: 'mfa',
        },
        locationId: 'location-1',
        businessId: 'business-1',
        now: new Date('2026-07-10T14:00:00.000Z'),
      }),
    ).toEqual([]);
  });

  it('reserves recovery resources for active owners and managers', () => {
    const decideOperations = (role: Role, scope: Scope) =>
      authorize({
        principal,
        principalAttributes: {
          assignments: [activeAssignment(role, scope)],
          identityActive: true,
          assuranceLevel: 'password',
        },
        action: 'production:resources',
        resource: productionOperationsResource(),
        environment: { now: new Date('2026-07-12T16:00:00.000Z') },
        policies: makeProductionPolicies(),
      });

    expect(decideOperations('owner', globalScope())).toMatchObject({
      tag: 'allowed',
    });
    expect(
      decideOperations('manager', locationScope('location-1')),
    ).toMatchObject({ tag: 'allowed' });
    expect(
      decideOperations('operator', locationScope('location-1')),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
  });
});
