import type { JsonObject } from '@pressly/codec';
import { sha256Text } from '@pressly/codec/node';
import { result, type Result } from '@pressly/kernel';
import type { WorkforceRole } from '../workforce/workforce.model.ts';
import {
  invalidWorkforceInputFailure,
  type WorkforceFailure,
} from '../workforce-failure/workforce-failure.failure.ts';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isWorkforceRole = (role: string): role is WorkforceRole =>
  role === 'owner' || role === 'manager' || role === 'operator';

export const invalidWorkforceInput = (field: string): WorkforceFailure =>
  invalidWorkforceInputFailure(field);

export const requireIdentifier = (
  value: string,
  field: string,
): Result<string, WorkforceFailure> => {
  const normalized = value.trim();
  return normalized.length > 0
    ? result.ok(normalized)
    : result.err(invalidWorkforceInput(field));
};

export const requireExpectedVersion = (
  value: number,
): Result<number, WorkforceFailure> =>
  Number.isSafeInteger(value) && value > 0
    ? result.ok(value)
    : result.err(invalidWorkforceInput('expected_version'));

export const requireEmail = (
  normalizedEmail: string,
): Result<string, WorkforceFailure> =>
  emailPattern.test(normalizedEmail)
    ? result.ok(normalizedEmail)
    : result.err(invalidWorkforceInput('email'));

export const requireDisplayName = (
  value: string,
): Result<string, WorkforceFailure> => {
  const displayName = value.trim();
  return displayName.length >= 2 && displayName.length <= 120
    ? result.ok(displayName)
    : result.err(invalidWorkforceInput('display_name'));
};

export const commandFingerprint = (
  commandType: string,
  fields: JsonObject,
): string => sha256Text(JSON.stringify({ commandType, ...fields }));
