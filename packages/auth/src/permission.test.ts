import { describe, expect, it } from 'vitest';

import type { Permission, Role } from './permission.ts';
import { isRole, permissionsForRole, selectHighestRole } from './permission.ts';

const rolePermissions: Record<Role, readonly Permission[]> = {
  owner: [
    'auth:session:read',
    'auth:session:revoke',
    'auth:user:manage',
    'pricing:read',
    'pricing:plan',
    'pricing:publish',
    'pricing:rollback',
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
  service: [
    'pricing:read',
    'pricing:plan',
    'pricing:publish',
    'pricing:rollback',
  ],
  developer: ['pricing:read', 'pricing:plan'],
  ci: ['pricing:read', 'pricing:plan', 'pricing:publish', 'pricing:rollback'],
};

describe('permissionsForRole', () => {
  it.each(
    Object.entries(rolePermissions) as Array<[Role, readonly Permission[]]>,
  )('returns permissions for %s', (role, expectedPermissions) => {
    expect(permissionsForRole(role)).toEqual(expectedPermissions);
  });
});

describe('isRole', () => {
  it('accepts every known role', () => {
    expect(Object.keys(rolePermissions).every((role) => isRole(role))).toBe(
      true,
    );
  });

  it.each([undefined, null, '', 'manager', 'ADMIN', 'pricing:read'])(
    'rejects %s',
    (value) => {
      expect(isRole(value)).toBe(false);
    },
  );
});

describe('selectHighestRole', () => {
  it('returns undefined for an empty role set', () => {
    expect(selectHighestRole([])).toBeUndefined();
  });

  it('selects the highest ranked role regardless of input order', () => {
    expect(selectHighestRole(['customer', 'developer', 'owner'])).toBe('owner');
    expect(selectHighestRole(['driver', 'operator', 'admin'])).toBe('admin');
  });

  it('keeps the first role when ranks tie', () => {
    expect(selectHighestRole(['developer', 'ci'])).toBe('developer');
    expect(selectHighestRole(['ci', 'developer'])).toBe('ci');
  });
});
