import { isAssignmentActive } from '../assignment.ts';
import type { Role } from '../role.ts';
import type { AuthResource } from '../resource.ts';
import type { PolicyCondition } from '../policy.ts';

export const hasActiveRole = <R extends AuthResource>(
  roles: readonly Role[],
): PolicyCondition<R> => ({
  name: 'has_active_role',
  denyReason: 'missing_assignment',
  safeMessage: 'You do not have permission to perform this action.',
  evaluate: ({ principalAttributes, environment }) =>
    principalAttributes.assignments.some(
      (assignment) =>
        roles.includes(assignment.role) &&
        isAssignmentActive(assignment, environment.now),
    ),
});
