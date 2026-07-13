import { isRole, type Role } from '@pressly/auth/authorization';

export const mapStoredRoles = (rows: readonly { role: string }[]): Role[] =>
  rows.map((row) => row.role).filter(isRole);
