import { result, type Result } from '@pressly/kernel';
import { expect } from 'vitest';
import { invariantViolationError, type AppError } from '@pressly/errors';

export const expectOk = <T>(actual: Result<T, AppError>): T => {
  expect(result.isOk(actual)).toBe(true);

  if (result.isErr(actual)) throw actual.error;

  return actual.value;
};

export const expectErrCode = <T>(
  actual: Result<T, AppError>,
  code: string,
): AppError => {
  expect(result.isErr(actual)).toBe(true);

  if (result.isOk(actual))
    throw invariantViolationError({
      code: 'expected_error_result',
      message: 'Expected error result, received ok result.',
    });

  expect(actual.error.code).toBe(code);

  return actual.error;
};
