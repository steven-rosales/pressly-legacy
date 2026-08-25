import { makeAppError, type ErrorKind } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import { isRetryableAppError } from '../../src/runtime/failure-disposition.ts';

const failure = (kind: ErrorKind, status: 409 | 422 | 429 | 500 | 502 | 503) =>
  makeAppError({
    kind,
    code: 'test_failure',
    message: 'test failure',
    status,
  });

describe('worker failure disposition', () => {
  it.each([
    ['ConflictError', 409, false],
    ['ValidationError', 422, false],
    ['RateLimitError', 429, true],
    ['InvariantViolationError', 500, false],
    ['UnexpectedError', 500, true],
    ['ExternalServiceError', 502, true],
    ['DatabaseError', 503, true],
  ] as const)('classifies %s/%s retryable=%s', (kind, status, retryable) => {
    expect(isRetryableAppError(failure(kind, status))).toBe(retryable);
  });
});
