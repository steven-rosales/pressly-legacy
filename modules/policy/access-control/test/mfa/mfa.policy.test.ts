import type { Principal } from '@pressly/auth/authentication';
import {
  authorize,
  globalScope,
  type PrincipalAttributes,
} from '@pressly/auth/authorization';
import { describe, expect, it } from 'vitest';
import { makeMfaPolicies } from '../../src/mfa/mfa.policy.ts';
import type { AuthIdentityResource } from '../../src/identity/auth-identity.resource.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Owner',
};
const resource: AuthIdentityResource = {
  kind: 'auth.identity',
  id: principal.identityId,
  scope: globalScope(),
  attributes: {},
};

const decide = (input: {
  action: 'auth:mfa:enroll' | 'auth:mfa:manage';
  assuranceLevel: 'password' | 'mfa';
  age?: number;
  role?: 'owner' | 'manager' | 'operator';
  identityActive?: boolean;
}) => {
  const principalAttributes: PrincipalAttributes = {
    identityActive: input.identityActive ?? true,
    assuranceLevel: input.assuranceLevel,
    assignments:
      input.role === undefined
        ? []
        : [{ role: input.role, scope: globalScope() }],
  };
  return authorize({
    principal,
    principalAttributes,
    action: input.action,
    resource,
    environment: {
      now: new Date('2026-06-29T12:00:00.000Z'),
      sessionAgeMinutes: input.age ?? 5,
    },
    policies: makeMfaPolicies({ freshSessionMaxAgeMinutes: 15 }),
  });
};

describe('MFA policy', () => {
  it('allows any active human to enroll itself from a fresh password session', () => {
    expect(
      decide({ action: 'auth:mfa:enroll', assuranceLevel: 'password' }).tag,
    ).toBe('allowed');
    expect(
      decide({
        action: 'auth:mfa:enroll',
        assuranceLevel: 'password',
        role: 'operator',
      }).tag,
    ).toBe('allowed');
    expect(
      decide({
        action: 'auth:mfa:enroll',
        assuranceLevel: 'password',
        identityActive: false,
      }),
    ).toMatchObject({ tag: 'denied', reason: 'inactive_identity' });
  });

  it('requires fresh MFA assurance for removal and recovery regeneration', () => {
    expect(
      decide({
        action: 'auth:mfa:manage',
        assuranceLevel: 'mfa',
        role: 'operator',
      }).tag,
    ).toBe('allowed');
    expect(
      decide({
        action: 'auth:mfa:manage',
        assuranceLevel: 'password',
        role: 'owner',
      }),
    ).toMatchObject({ tag: 'denied', reason: 'insufficient_assurance' });
    expect(
      decide({
        action: 'auth:mfa:manage',
        assuranceLevel: 'mfa',
        role: 'owner',
        age: 16,
      }),
    ).toMatchObject({ tag: 'denied', reason: 'stale_session' });
  });
});
