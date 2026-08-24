import type { Principal } from '../../../authentication/public.ts';
import {
  authorize,
  businessScope,
  globalScope,
  type PrincipalAttributes,
  type Role,
} from '../../public.ts';
import { describe, expect, it } from 'vitest';
import { makeAuthSessionPolicies } from './auth-session-authorization.policy.ts';
import type { AuthIdentityResource } from '../../language/identity-resource/auth-identity.value.ts';

const identityId = '11111111-1111-4111-8111-111111111111';
const principal: Principal = {
  identityId,
  kind: 'human',
  displayName: 'Owner',
};

const resource = (targetIdentityId: string): AuthIdentityResource => ({
  kind: 'auth.identity',
  id: targetIdentityId,
  scope: globalScope(),
  attributes: {},
});

const decide = (input: {
  action: 'auth:session:read' | 'auth:session:revoke';
  targetIdentityId: string;
  role?: Role;
  sessionAgeMinutes?: number;
}) => {
  const principalAttributes: PrincipalAttributes = {
    identityActive: true,
    assignments:
      input.role === undefined
        ? []
        : [
            {
              role: input.role,
              scope: businessScope('business-1'),
              state: 'active',
              version: 1,
            },
          ],
    assuranceLevel: 'mfa',
  };

  return authorize({
    principal,
    principalAttributes,
    action: input.action,
    resource: resource(input.targetIdentityId),
    environment: {
      now: new Date('2026-06-29T12:00:00.000Z'),
      sessionAgeMinutes: input.sessionAgeMinutes ?? 5,
    },
    policies: makeAuthSessionPolicies({ freshSessionMaxAgeMinutes: 15 }),
  });
};

describe('auth session administration policy', () => {
  it('allows an active identity to inspect and revoke its own sessions', () => {
    for (const action of ['auth:session:read', 'auth:session:revoke'] as const)
      expect(decide({ action, targetIdentityId: identityId })).toMatchObject({
        tag: 'allowed',
      });
  });

  it('allows an MFA-assured owner to inspect another identity sessions', () => {
    expect(
      decide({
        action: 'auth:session:read',
        targetIdentityId: '22222222-2222-4222-8222-222222222222',
        role: 'owner',
      }),
    ).toMatchObject({
      tag: 'allowed',
      policyId: 'auth.sessions.read.active_owner',
    });
  });

  it('denies cross-identity session management to managers', () => {
    expect(
      decide({
        action: 'auth:session:read',
        targetIdentityId: '22222222-2222-4222-8222-222222222222',
        role: 'manager',
      }),
    ).toMatchObject({ tag: 'denied', reason: 'missing_assignment' });
  });

  it('requires a fresh owner session to revoke another identity sessions', () => {
    expect(
      decide({
        action: 'auth:session:revoke',
        targetIdentityId: '22222222-2222-4222-8222-222222222222',
        role: 'owner',
      }),
    ).toMatchObject({ tag: 'allowed' });
    expect(
      decide({
        action: 'auth:session:revoke',
        targetIdentityId: '22222222-2222-4222-8222-222222222222',
        role: 'owner',
        sessionAgeMinutes: 16,
      }),
    ).toMatchObject({ tag: 'denied', reason: 'stale_session' });
  });
});
