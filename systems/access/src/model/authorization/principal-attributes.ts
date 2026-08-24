import type { RoleAssignment } from './assignment.ts';

export type PrincipalAttributes = Readonly<{
  assignments: readonly RoleAssignment[];
  identityActive: boolean;
  assuranceLevel?: 'password' | 'mfa' | 'service_key';
}>;

export const principalAttributesFromSession = (input: {
  assignments: readonly RoleAssignment[];
  identityActive: boolean;
  assuranceLevel?: PrincipalAttributes['assuranceLevel'];
}): PrincipalAttributes => ({
  assignments: [...input.assignments],
  identityActive: input.identityActive,
  ...(input.assuranceLevel === undefined
    ? {}
    : { assuranceLevel: input.assuranceLevel }),
});
