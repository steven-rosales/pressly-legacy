import type { Role } from './role.ts';
import type { Scope } from './scope.ts';

export type RoleAssignment = Readonly<{
  role: Role;
  scope: Scope;
  state?: 'active' | 'revoked' | 'expired';
  version?: number;
  startsAt?: Date;
  endsAt?: Date;
}>;

export const isAssignmentActive = (
  assignment: RoleAssignment,
  now: Date,
): boolean => {
  if (assignment.state !== undefined && assignment.state !== 'active')
    return false;

  if (assignment.startsAt !== undefined && assignment.startsAt > now)
    return false;

  if (assignment.endsAt !== undefined && assignment.endsAt <= now) return false;

  return true;
};
