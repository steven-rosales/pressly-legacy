import { describe, expect, it } from 'vitest';
import {
  controlCapabilitiesFor,
  isControlGrant,
} from '../../../../src/features/session/resolve-control-access/control-access.policy.ts';
import type { EffectiveControlGrant } from '../../../../src/foundations/language/control-access/control-access.model.ts';

const grant = (
  role: string,
  scopeKind = 'business',
): EffectiveControlGrant => ({
  businessId: '00000000-0000-4000-8000-000000000100',
  businessName: 'Laundry Production',
  role,
  scopeKind,
  scopeId:
    scopeKind === 'business'
      ? '00000000-0000-4000-8000-000000000100'
      : 'pressly-one',
});

describe('Control access policy', () => {
  it.each([
    ['owner', true],
    ['manager', true],
    ['operator', false],
    ['unknown', false],
  ])('classifies the %s role as Control access=%s', (role, expected) => {
    expect(isControlGrant(grant(role))).toBe(expected);
  });

  it('limits a password-only session to MFA enrollment', () => {
    expect(controlCapabilitiesFor([grant('owner')], 'password')).toEqual([
      'control:view',
      'auth:mfa:enroll',
    ]);
  });

  it('gives an MFA manager operational management without owner-only writes', () => {
    const capabilities = controlCapabilitiesFor([grant('manager')], 'mfa');
    expect(capabilities).toEqual([
      'control:view',
      'team:read',
      'team:write',
      'customers:read',
      'customers:write',
      'orders:read',
      'orders:write',
      'security:read',
      'processor:view',
    ]);
    expect(capabilities).not.toContain('security:write');
  });

  it('adds security writes only when an effective owner grant exists', () => {
    expect(
      controlCapabilitiesFor(
        [grant('manager', 'location'), grant('owner')],
        'mfa',
      ),
    ).toContain('security:write');
  });
});
