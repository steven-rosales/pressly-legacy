import {
  allow,
  freshSession,
  hasAssuranceLevel,
  hasScopedRole,
  sameIdentity,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { AuthIdentityResource } from '../resources/auth.resources.ts';

export const makeMfaPolicies = (input: {
  freshSessionMaxAgeMinutes: number;
}): readonly PolicyRule<AuthIdentityResource>[] => [
  allow({
    id: 'auth.mfa.enroll.self.fresh_password_or_mfa',
    action: 'auth:mfa:enroll',
    when: [
      hasScopedRole(['owner', 'admin']),
      sameIdentity(),
      hasAssuranceLevel(['password', 'mfa']),
      freshSession(input.freshSessionMaxAgeMinutes),
    ],
  }),
  allow({
    id: 'auth.mfa.manage.self.fresh_mfa',
    action: 'auth:mfa:manage',
    when: [
      hasScopedRole(['owner', 'admin']),
      sameIdentity(),
      hasAssuranceLevel(['mfa']),
      freshSession(input.freshSessionMaxAgeMinutes),
    ],
  }),
];
