import { result, type Result } from '@pressly/kernel';
import { expect } from 'vitest';
import type { AppError } from '@pressly/errors';
import { makeAppError } from '@pressly/errors';

export const expectOk = <T>(actual: Result<T, AppError>): T => {
  expect(result.isOk(actual)).toBe(true);

  if (result.isErr(actual))
    throw makeAppError({
      kind: actual.error.kind,
      code: actual.error.code,
      message: actual.error.message,
      status: actual.error.status,
    });

  return actual.value;
};

export const expectErrCode = <T>(
  actual: Result<T, AppError>,
  code: string,
): AppError => {
  expect(result.isErr(actual)).toBe(true);

  if (result.isOk(actual))
    throw makeAppError({
      kind: 'UnexpectedError',
      code: 'expected_error_result',
      message: 'Expected error result, received ok result.',
      status: 400,
    });

  expect(actual.error.code).toBe(code);

  return actual.error;
};
