import { createHash } from 'node:crypto';
import { validationError, type AppError } from '@pressly/errors';
import { result, type Result } from '@pressly/kernel';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const invalidWorkforceInput = (
  field: string,
  message = 'Workforce command input is invalid.',
): AppError =>
  validationError({
    code: `invalid_workforce_${field}`,
    message,
    safeMessage: 'Review the highlighted workforce information.',
    details: { field },
  });

export const requireIdentifier = (
  value: string,
  field: string,
): Result<string, AppError> => {
  const normalized = value.trim();
  return normalized.length > 0
    ? result.ok(normalized)
    : result.err(invalidWorkforceInput(field));
};

export const requireExpectedVersion = (
  value: number,
): Result<number, AppError> =>
  Number.isSafeInteger(value) && value > 0
    ? result.ok(value)
    : result.err(invalidWorkforceInput('expected_version'));

export const requireEmail = (
  normalizedEmail: string,
): Result<string, AppError> =>
  emailPattern.test(normalizedEmail)
    ? result.ok(normalizedEmail)
    : result.err(invalidWorkforceInput('email'));

export const requireDisplayName = (value: string): Result<string, AppError> => {
  const displayName = value.trim();
  return displayName.length >= 2 && displayName.length <= 120
    ? result.ok(displayName)
    : result.err(invalidWorkforceInput('display_name'));
};

export const commandFingerprint = (
  commandType: string,
  fields: Readonly<Record<string, unknown>>,
): string =>
  createHash('sha256')
    .update(JSON.stringify({ commandType, ...fields }))
    .digest('hex');
