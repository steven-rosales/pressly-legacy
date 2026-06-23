import type { Role } from './role.ts';
import type { Scope } from './scope.ts';

export type RoleAssignment = Readonly<{
  role: Role;
  scope: Scope;
  startsAt?: Date;
  endsAt?: Date;
}>;

export const isAssignmentActive = (
  assignment: RoleAssignment,
  now: Date,
): boolean => {
  if (assignment.startsAt !== undefined && assignment.startsAt > now)
    return false;

  if (assignment.endsAt !== undefined && assignment.endsAt <= now) return false;

  return true;
};
