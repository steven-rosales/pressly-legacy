import * as result from '@pressly/cells/result';
import type { Result } from '@pressly/cells/result';
import { expect } from 'vitest';
import { invariantViolationError } from '@pressly/errors/factories';

type CodedFailure = Readonly<{ code: string }>;

export const expectOk = <T, E>(actual: Result<T, E>): T => {
  expect(result.isOk(actual)).toBe(true);

  if (result.isErr(actual)) {
    if (actual.error instanceof Error) throw actual.error;

    throw invariantViolationError({
      code: 'expected_ok_result',
      message: 'Expected ok result, received typed failure.',
      details: { failure: actual.error },
    });
  }

  return actual.value;
};

export const expectErrCode = <T, E extends CodedFailure>(
  actual: Result<T, E>,
  code: string,
): E => {
  expect(result.isErr(actual)).toBe(true);

  if (result.isOk(actual))
    throw invariantViolationError({
      code: 'expected_error_result',
      message: 'Expected error result, received ok result.',
    });

  expect(actual.error.code).toBe(code);

  return actual.error;
};
