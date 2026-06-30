import { describe, expect, it } from 'vitest';

import { isRole, type Role } from '../../src/authorization/index.ts';

const roles: readonly Role[] = [
  'owner',
  'admin',
  'operator',
  'customer',
  'driver',
  'service',
  'developer',
  'ci',
];

describe('isRole', () => {
  it('accepts known roles', () => {
    expect(roles.every((role) => isRole(role))).toBe(true);
  });

  it.each([undefined, null, '', 'manager', 'ADMIN', 'pricing:read'])(
    'rejects %s',
    (value) => {
      expect(isRole(value)).toBe(false);
    },
  );
});
