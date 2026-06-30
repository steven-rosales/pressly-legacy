import type { Role } from '../role.ts';
import type { AuthResource } from '../resource.ts';
import { isAssignmentActive } from '../assignment.ts';
import { scopeCovers } from '../scope.ts';
import type { PolicyCondition } from '../policy.ts';

export const hasScopedRole = <R extends AuthResource>(
  roles: readonly Role[],
): PolicyCondition<R> => ({
  name: 'has_scope_role',
  denyReason: 'missing_assignment',
  safeMessage: 'You do not have permission to perform this action.',
  evaluate: ({ principalAttributes, resource, environment }) =>
    principalAttributes.assignments.some(
      (assignment) =>
        roles.includes(assignment.role) &&
        isAssignmentActive(assignment, environment.now) &&
        scopeCovers(assignment.scope, resource.scope),
    ),
});
