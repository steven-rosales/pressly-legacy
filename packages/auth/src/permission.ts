export type Permission =
  | 'pricing:read'
  | 'pricing:plan'
  | 'pricing:publish'
  | 'pricing:rollback';

export type Role = 'developer' | 'admin' | 'ci';

const permissionByRole: Record<Role, readonly Permission[]> = {
  developer: ['pricing:read', 'pricing:plan'],
  admin: [
    'pricing:read',
    'pricing:plan',
    'pricing:publish',
    'pricing:rollback',
  ],
  ci: ['pricing:read', 'pricing:plan', 'pricing:publish', 'pricing:rollback'],
};

export const permissionsForRole = (role: Role): readonly Permission[] =>
  permissionByRole[role];

export const isRole = (value: unknown): value is Role =>
  value === 'developer' || value === 'admin' || value === 'ci';
