import { isRole, type Role } from '../../model/authorization/public.ts';

export const mapStoredWorkforceRoles = (
  rows: readonly { role: string }[],
): Role[] => rows.map((row) => row.role).filter(isRole);
