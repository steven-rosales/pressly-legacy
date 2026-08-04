import {
  allow,
  freshSession,
  hasAssuranceLevel,
  sameIdentity,
  type PolicyRule,
} from '@pressly/auth/authorization';
import type { AuthIdentityResource } from '../../../foundations/language/identity-resource/auth-identity.value.ts';

export const makeMfaPolicies = (input: {
  freshSessionMaxAgeMinutes: number;
}): readonly PolicyRule<AuthIdentityResource>[] => [
  allow({
    id: 'auth.mfa.enroll.active_self.fresh_password_or_mfa',
    action: 'auth:mfa:enroll',
    when: [
      sameIdentity(),
      hasAssuranceLevel(['password', 'mfa']),
      freshSession(input.freshSessionMaxAgeMinutes),
    ],
  }),
  allow({
    id: 'auth.mfa.manage.active_self.fresh_mfa',
    action: 'auth:mfa:manage',
    when: [
      sameIdentity(),
      hasAssuranceLevel(['mfa']),
      freshSession(input.freshSessionMaxAgeMinutes),
    ],
  }),
];
