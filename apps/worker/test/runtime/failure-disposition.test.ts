import { makeAppError, type ErrorKind } from '@pressly/errors/app-error';
import { describe, expect, it } from 'vitest';
import {
  decideFailureDisposition,
  isRetryableAppError,
} from '../../src/runtime/failure-disposition.ts';

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

  it('bounds retries by the durable attempt count', () => {
    expect(
      decideFailureDisposition({ retryable: true, attempt: 2, maxAttempts: 3 }),
    ).toEqual({ action: 'retry', reason: 'transient_failure' });
    expect(
      decideFailureDisposition({ retryable: true, attempt: 3, maxAttempts: 3 }),
    ).toEqual({ action: 'dead_letter', reason: 'attempts_exhausted' });
    expect(
      decideFailureDisposition({
        retryable: false,
        attempt: 1,
        maxAttempts: 3,
      }),
    ).toEqual({ action: 'dead_letter', reason: 'permanent_failure' });
  });
});
