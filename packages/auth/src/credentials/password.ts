export type PasswordStrengthViolation =
  | 'password_too_short'
  | 'password_requires_lowercase'
  | 'password_requires_uppercase'
  | 'password_requires_number'
  | 'password_requires_symbol';

export const validatePasswordStrength = (
  password: string,
): readonly PasswordStrengthViolation[] => {
  const violations: PasswordStrengthViolation[] = [];

  if (password.length < 16) violations.push('password_too_short');
  if (!/[a-z]/.test(password)) violations.push('password_requires_lowercase');
  if (!/[A-Z]/.test(password)) violations.push('password_requires_uppercase');
  if (!/\d/.test(password)) violations.push('password_requires_number');
  if (!/[^A-Za-z0-9]/.test(password))
    violations.push('password_requires_symbol');

  return violations;
};
