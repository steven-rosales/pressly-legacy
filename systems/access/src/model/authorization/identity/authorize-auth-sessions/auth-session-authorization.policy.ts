import {
  allow,
  freshSession,
  hasActiveRole,
  hasAssuranceLevel,
  sameIdentity,
  type PolicyRule,
} from '../../public.ts';
import type { AuthIdentityResource } from '../../language/identity-resource/auth-identity.value.ts';

export const makeAuthSessionPolicies = (input: {
  freshSessionMaxAgeMinutes: number;
}): readonly PolicyRule<AuthIdentityResource>[] => [
  allow({
    id: 'auth.sessions.read.active_owner',
    action: 'auth:session:read',
    when: [hasActiveRole(['owner']), hasAssuranceLevel(['mfa'])],
  }),
  allow({
    id: 'auth.sessions.read.active_self',
    action: 'auth:session:read',
    when: [sameIdentity()],
  }),
  allow({
    id: 'auth.sessions.revoke.active_owner.fresh_session',
    action: 'auth:session:revoke',
    when: [
      hasActiveRole(['owner']),
      hasAssuranceLevel(['mfa']),
      freshSession(input.freshSessionMaxAgeMinutes),
    ],
  }),
  allow({
    id: 'auth.sessions.revoke.active_self',
    action: 'auth:session:revoke',
    when: [sameIdentity()],
  }),
];
