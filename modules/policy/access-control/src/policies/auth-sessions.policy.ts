import {
  allow,
  freshSession,
  hasScopedRole,
  hasAssuranceLevel,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { AuthIdentityResource } from '../resources/auth.resources.ts';

export const makeAuthSessionPolicies = (input: {
  freshSessionMaxAgeMinutes: number;
}): readonly PolicyRule<AuthIdentityResource>[] => [
  allow({
    id: 'auth.sessions.read.owner_or_admin',
    action: 'auth:session:read',
    when: [hasScopedRole(['owner', 'admin']), hasAssuranceLevel(['mfa'])],
  }),
  allow({
    id: 'auth.sessions.revoke.owner.fresh_session',
    action: 'auth:session:revoke',
    when: [
      hasScopedRole(['owner']),
      hasAssuranceLevel(['mfa']),
      freshSession(input.freshSessionMaxAgeMinutes),
    ],
  }),
];
