/**
 * This Permission shape is fine for now, but later:
 * 1) Split permissions by boundary context, not technical shape: auth.permissions.ts, pricing.permissions.ts, etc.
 * 2) Keep role grants composed centrally in auth, because roles are cross domain security policy
 * 3) Add runtime/dev validation that every granted permission exists in the registry
 * 4) Add metadata when useful: owner/domain, description, maybe deprecation state. Do not turn permissions into a database/config system unless non-engineers need to edit them
 */

export type Permission =
  | 'auth:session:read'
  | 'auth:session:revoke'
  | 'auth:user:manage'
  | 'pricing:read'
  | 'pricing:plan'
  | 'pricing:publish'
  | 'pricing:rollback';

export type Role =
  | 'owner'
  | 'admin'
  | 'operator'
  | 'customer'
  | 'driver'
  | 'service'
  | 'developer'
  | 'ci';

const allPricingPermissions: readonly Permission[] = [
  'pricing:read',
  'pricing:plan',
  'pricing:publish',
  'pricing:rollback',
];

const permissionByRole: Record<Role, readonly Permission[]> = {
  owner: [
    'auth:session:read',
    'auth:session:revoke',
    'auth:user:manage',
    ...allPricingPermissions,
  ],
  admin: [
    'auth:session:read',
    'pricing:read',
    'pricing:plan',
    'pricing:publish',
    'pricing:rollback',
  ],
  operator: ['pricing:read'],
  customer: [],
  driver: [],
  service: allPricingPermissions,
  developer: ['pricing:read', 'pricing:plan'],
  ci: allPricingPermissions,
};

const rankByRole: Record<Role, number> = {
  owner: 100,
  admin: 90,
  operator: 80,
  service: 70,
  developer: 60,
  ci: 60,
  driver: 40,
  customer: 30,
};

export const permissionsForRole = (role: Role): readonly Permission[] =>
  permissionByRole[role];

export const isRole = (value: unknown): value is Role =>
  value === 'owner' ||
  value === 'admin' ||
  value === 'operator' ||
  value === 'customer' ||
  value === 'driver' ||
  value === 'service' ||
  value === 'developer' ||
  value === 'ci';

export const selectHighestRole = (roles: readonly Role[]): Role | undefined =>
  roles.reduce<Role | undefined>((selected, role) => {
    if (selected === undefined) return role;

    return rankByRole[role] > rankByRole[selected] ? role : selected;
  }, undefined);
