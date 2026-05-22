import { expect } from 'vitest';
import type { AppError, Result } from '@pressly/errors';
import { makeAppError } from '@pressly/errors';

export const expectOk = <T>(result: Result<T, AppError>): T => {
  expect(result.ok).toBe(true);

  if (!result.ok)
    throw makeAppError({
      kind: result.error.kind,
      code: result.error.code,
      message: result.error.message,
      status: result.error.status,
    });

  return result.value;
};

export const expectErrCode = <T>(
  result: Result<T, AppError>,
  code: string,
): AppError => {
  expect(result.ok).toBe(false);

  if (result.ok)
    throw makeAppError({
      kind: 'UnexpectedError',
      code: 'expected_error_result',
      message: 'Expected error result, received ok result.',
      status: 400,
    });

  expect(result.error.code).toBe(code);

  return result.error;
};
