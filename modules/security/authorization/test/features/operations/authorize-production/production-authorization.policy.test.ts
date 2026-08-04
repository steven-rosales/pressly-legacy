import type { Principal } from '@pressly/auth/authentication';
import {
  authorize,
  businessScope,
  globalScope,
  locationScope,
  type Action,
  type Role,
} from '@pressly/auth/authorization';
import { describe, expect, it } from 'vitest';
import {
  makeProductionPolicies,
  productionCapabilitiesForLocation,
} from '../../../../src/features/operations/authorize-production/production-authorization.policy.ts';
import {
  productionLocationResource,
  productionOperationsResource,
} from '../../../../src/features/operations/authorize-production/production-resource.value.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Floor operator',
};

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
              {
                role: input.role,
                scope: locationScope(input.assignmentLocation ?? 'location-1'),
              },
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
  it.each(['owner', 'manager', 'admin'] as const)(
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

  it('denies unknown roles, wrong scope, and inactive identities', () => {
    expect(
      decide({ action: 'production:read', role: 'customer' }),
    ).toMatchObject({ tag: 'denied' });
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
          assignments: [{ role: 'manager', scope: businessScope(businessId) }],
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
          { role: 'manager', scope: locationScope('location-1') },
          { role: 'owner', scope: locationScope('location-2') },
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
            { role: 'manager', scope: locationScope('location-2') },
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

  it('reserves global recovery resources for globally assigned operators', () => {
    const decideOperations = (scope: ReturnType<typeof globalScope>) =>
      authorize({
        principal,
        principalAttributes: {
          assignments: [{ role: 'admin', scope }],
          identityActive: true,
          assuranceLevel: 'password',
        },
        action: 'production:resources',
        resource: productionOperationsResource(),
        environment: { now: new Date('2026-07-12T16:00:00.000Z') },
        policies: makeProductionPolicies(),
      });

    expect(decideOperations(globalScope())).toMatchObject({ tag: 'allowed' });
    expect(
      authorize({
        principal,
        principalAttributes: {
          assignments: [{ role: 'admin', scope: locationScope('location-1') }],
          identityActive: true,
          assuranceLevel: 'password',
        },
        action: 'production:resources',
        resource: productionOperationsResource(),
        environment: { now: new Date('2026-07-12T16:00:00.000Z') },
        policies: makeProductionPolicies(),
      }),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
  });
});
