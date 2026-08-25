import { describe, expect, it } from 'vitest';
import {
  passwordStrengthPolicy,
  validatePasswordStrength,
} from './password-strength.ts';

describe('Access password strength', () => {
  it('retains the exact sixteen-character composition policy and violation order', () => {
    expect(passwordStrengthPolicy).toEqual({ minimumLength: 16 });
    expect(validatePasswordStrength('')).toEqual([
      'password_too_short',
      'password_requires_lowercase',
      'password_requires_uppercase',
      'password_requires_number',
      'password_requires_symbol',
    ]);
    expect(validatePasswordStrength('CorrectHorse1!Battery')).toEqual([]);
  });

  it.each([
    ['Abcdefghijklm1!', 'password_too_short'],
    ['ABCDEFGHIJKLMN1!', 'password_requires_lowercase'],
    ['abcdefghijklmn1!', 'password_requires_uppercase'],
    ['Abcdefghijklmnop!', 'password_requires_number'],
    ['Abcdefghijklmnop1', 'password_requires_symbol'],
  ] as const)('reports %s as %s', (password, violation) => {
    expect(validatePasswordStrength(password)).toContain(violation);
  });
});
