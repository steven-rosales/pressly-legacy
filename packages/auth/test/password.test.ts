import { describe, expect, it } from 'vitest';

import { validatePasswordStrength } from '../src/password.ts';

describe('validatePasswordStrength', () => {
  it('accepts a long password with lowercase, uppercase, number, and symbol', () => {
    expect(validatePasswordStrength('CorrectHorse1!Battery')).toEqual([]);
  });

  it('reports every violation for a short empty password', () => {
    expect(validatePasswordStrength('')).toEqual([
      'password_too_short',
      'password_requires_lowercase',
      'password_requires_uppercase',
      'password_requires_number',
      'password_requires_symbol',
    ]);
  });

  it.each([
    {
      password: 'N0-SYMBOL-OR-LOWER',
      violation: 'password_requires_lowercase',
    },
    {
      password: 'n0-symbol-or-upper',
      violation: 'password_requires_uppercase',
    },
    {
      password: 'NoNumberSymbolHere!',
      violation: 'password_requires_number',
    },
    {
      password: 'NoSymbolNumber123',
      violation: 'password_requires_symbol',
    },
    {
      password: 'Short1!',
      violation: 'password_too_short',
    },
  ] as const)('reports $violation', ({ password, violation }) => {
    expect(validatePasswordStrength(password)).toContain(violation);
  });

  it('treats exactly 16 characters as long enough', () => {
    expect(validatePasswordStrength('Abcdefghijklm1!n')).not.toContain(
      'password_too_short',
    );
  });
});
