import { controlAuthBoundaryRequirements } from '@pressly/experience-control/testing/auth-boundaries';
import { controlAuthCellDeclarations } from '@pressly/experience-control/testing/assembly';
import { customerAuthBoundaryRequirements } from '@pressly/experience-customer/testing/auth-boundaries';
import { customerAuthCellDeclarations } from '@pressly/experience-customer/testing/assembly';
import {
  processorAuthBoundaryRequirements,
  processorAuthenticationCellDeclarations,
} from '@pressly/experience-processor/server';
import { describe, expect, it } from 'vitest';
import {
  authenticationExperienceRoutes,
  verifyAuthenticationExperienceInventory,
} from '../src/public.ts';

const expectedRoutes = [
  ['POST', '/auth/login', '8kb'],
  ['GET', '/auth/session', '64kb'],
  ['POST', '/auth/logout', '64kb'],
  ['POST', '/auth/mfa/challenge', '4kb'],
  ['GET', '/auth/identities/:identityId/sessions', '64kb'],
  ['POST', '/auth/identities/:identityId/sessions/revoke-all', '64kb'],
  ['POST', '/auth/identities/:identityId/sessions/:sessionId/revoke', '64kb'],
  ['POST', '/auth/mfa/enrollment', '64kb'],
  ['POST', '/auth/mfa/enrollment/confirm', '4kb'],
  ['POST', '/auth/mfa/recovery-codes/regenerate', '64kb'],
  ['POST', '/auth/mfa/remove', '64kb'],
  ['POST', '/control/auth/login', '8kb'],
  ['POST', '/control/auth/mfa/challenge', '4kb'],
  ['GET', '/control/auth/session', '16kb'],
  ['POST', '/control/auth/logout', '16kb'],
  ['GET', '/control/auth/identities/:identityId/sessions', '16kb'],
  ['POST', '/control/auth/identities/:identityId/sessions/revoke-all', '16kb'],
  [
    'POST',
    '/control/auth/identities/:identityId/sessions/:sessionId/revoke',
    '16kb',
  ],
  ['POST', '/control/auth/mfa/enrollment', '16kb'],
  ['POST', '/control/auth/mfa/enrollment/confirm', '16kb'],
  ['POST', '/control/auth/mfa/recovery-codes/regenerate', '16kb'],
  ['POST', '/control/auth/mfa/remove', '16kb'],
  ['POST', '/processor/auth/login', '8kb'],
  ['POST', '/processor/auth/mfa/challenge', '4kb'],
  ['GET', '/processor/auth/session', '64kb'],
  ['POST', '/processor/auth/logout', '64kb'],
] as const;

describe('authentication Experience inventory', () => {
  it('owns the exact 11 Customer, 11 Control and 4 Processor seams', () => {
    expect(verifyAuthenticationExperienceInventory()).toEqual({
      routeCount: 26,
      realmCounts: { customer: 11, control: 11, processor: 4 },
      issues: [],
    });
    expect(
      authenticationExperienceRoutes
        .map((route) => [route.method, route.path, route.bodyLimit] as const)
        .sort((left, right) => left[1].localeCompare(right[1])),
    ).toEqual(
      [...expectedRoutes].sort((left, right) =>
        left[1].localeCompare(right[1]),
      ),
    );
  });

  it('exposes one versioned contract and one HTTP surface per operation', () => {
    const declarations = [
      ...Object.values(customerAuthCellDeclarations),
      ...Object.values(controlAuthCellDeclarations),
      ...Object.values(processorAuthenticationCellDeclarations),
    ];
    expect(declarations).toHaveLength(26);
    for (const declaration of declarations) {
      expect(declaration.contract).toMatchObject({
        input: { version: 1 },
        output: { version: 1 },
        failure: { version: 1 },
      });
      expect(declaration.surfaces).toHaveLength(1);
      expect(declaration.surfaces[0]?.kind).toBe('http');
    }
  });

  it('proves conditional parsing and cookie-failure observation from the selected profiles', () => {
    const requirements = [
      ...customerAuthBoundaryRequirements,
      ...controlAuthBoundaryRequirements,
      ...processorAuthBoundaryRequirements,
    ];
    expect(requirements).toHaveLength(26);
    expect(
      authenticationExperienceRoutes.filter(
        (route) => route.requestBodyContentType === 'parse-if-matching',
      ),
    ).toHaveLength(18);
    expect(
      authenticationExperienceRoutes.filter(
        (route) => route.expectedFailureObservation === 'cookie-auth-failure',
      ),
    ).toHaveLength(8);
    expect(
      customerAuthBoundaryRequirements.find(
        (requirement) => requirement.operationId === 'customer.auth-login.v1',
      )?.profile,
    ).toMatchObject({
      requestRateLimit: 'auth_login',
      inputValidationPhase: 'before-authentication',
    });
    expect(
      controlAuthBoundaryRequirements.find(
        (requirement) =>
          requirement.operationId === 'control.confirm-mfa-enrollment.v1',
      )?.profile.inputValidationPhase,
    ).toBe('before-authentication');
    expect(
      processorAuthBoundaryRequirements.find(
        (requirement) => requirement.operationId === 'processor.auth-login.v1',
      )?.profile,
    ).toMatchObject({
      requestRateLimit: 'processor_auth_login',
      inputValidationPhase: 'after-authentication',
    });
  });
});
