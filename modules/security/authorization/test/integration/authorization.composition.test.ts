import { describe, expect, it } from 'vitest';
import { makeAuthorizationModule } from '../../src/composition/authorization.composition.ts';

describe('Authorization composition', () => {
  it('exposes immutable policies, resources, and scope queries without a framework', () => {
    const authorization = makeAuthorizationModule({
      locationAncestry: {
        resolveBusinessId: async () => 'business-1',
        listLocationIdsForBusinesses: async () => [],
      },
      clock: { now: () => new Date('2026-08-03T12:00:00.000Z') },
      policies: {
        pricing: { freshSessionMaxAgeMinutes: 15 },
        authSessions: { freshSessionMaxAgeMinutes: 15 },
        mfa: { freshSessionMaxAgeMinutes: 15 },
      },
    });

    expect(authorization.policies).toEqual({
      pricing: expect.any(Array),
      authSessions: expect.any(Array),
      mfa: expect.any(Array),
      orderManagement: expect.any(Array),
      production: expect.any(Array),
    });
    expect(authorization.resources).toEqual({
      authIdentity: expect.any(Function),
      pricingCatalog: expect.any(Function),
      orderManagementUsers: expect.any(Function),
      orderManagementLocation: expect.any(Function),
      productionLocation: expect.any(Function),
      productionOperations: expect.any(Function),
    });
    expect(Object.isFrozen(authorization)).toBe(true);
    expect(Object.isFrozen(authorization.policies)).toBe(true);
    expect(Object.isFrozen(authorization.resources)).toBe(true);
  });
});
