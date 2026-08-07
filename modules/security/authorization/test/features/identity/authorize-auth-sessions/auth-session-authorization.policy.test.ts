import type { Principal } from '@pressly/auth/authentication';
import {
  authorize,
  globalScope,
  type PrincipalAttributes,
  type Role,
} from '@pressly/auth/authorization';
import { describe, expect, it } from 'vitest';
import { makeAuthSessionPolicies } from '../../../../src/features/identity/authorize-auth-sessions/auth-session-authorization.policy.ts';
import type { AuthIdentityResource } from '../../../../src/foundations/language/identity-resource/auth-identity.value.ts';

const principal: Principal = {
  identityId: '11111111-1111-4111-8111-111111111111',
  kind: 'human',
  displayName: 'Owner',
};

const resource: AuthIdentityResource = {
  kind: 'auth.identity',
  id: '22222222-2222-4222-8222-222222222222',
  scope: globalScope(),
  attributes: {},
};

const decide = (input: {
  action: 'auth:session:read' | 'auth:session:revoke';
  role: Role;
  sessionAgeMinutes?: number;
}) => {
  const principalAttributes: PrincipalAttributes = {
    identityActive: true,
    assignments: [{ role: input.role, scope: globalScope() }],
    assuranceLevel: 'mfa',
  };

  return authorize({
    principal,
    principalAttributes,
    action: input.action,
    resource,
    environment: {
      now: new Date('2026-06-29T12:00:00.000Z'),
      sessionAgeMinutes: input.sessionAgeMinutes ?? 5,
    },
    policies: makeAuthSessionPolicies({ freshSessionMaxAgeMinutes: 15 }),
  });
};

describe('auth session administration policy', () => {
  it('allows owners and admins to inspect sessions', () => {
    expect(decide({ action: 'auth:session:read', role: 'owner' }).tag).toBe(
      'allowed',
    );
    expect(decide({ action: 'auth:session:read', role: 'admin' }).tag).toBe(
      'allowed',
    );
  });

  it('denies session inspection to non-privileged roles', () => {
    expect(
      decide({ action: 'auth:session:read', role: 'operator' }),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
  });

  it('allows only a fresh owner session to revoke sessions', () => {
    expect(decide({ action: 'auth:session:revoke', role: 'owner' }).tag).toBe(
      'allowed',
    );
    expect(
      decide({ action: 'auth:session:revoke', role: 'admin' }),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
    expect(
      decide({
        action: 'auth:session:revoke',
        role: 'owner',
        sessionAgeMinutes: 16,
      }),
    ).toMatchObject({ tag: 'denied', reason: 'stale_session' });
  });
});
