import { describe, expect, it } from 'vitest';

import { isRole, type Role } from './public.ts';

const roles: readonly Role[] = ['owner', 'manager', 'operator'];

describe('isRole', () => {
  it('accepts known roles', () => {
    expect(roles.every((role) => isRole(role))).toBe(true);
  });

  it.each([
    undefined,
    null,
    '',
    'admin',
    'customer',
    'service',
    'supervisor',
    'ADMIN',
    'pricing:read',
  ])('rejects %s', (value) => {
    expect(isRole(value)).toBe(false);
  });
});
