import { describe, expect, it } from 'vitest';
import {
  authError,
  configError,
  conflictError,
  databaseError,
  externalServiceError,
  invariantViolationError,
  notFoundError,
  permissionError,
  rateLimitError,
  unexpectedError,
  validationError,
} from '../src/factories.js';

const input = {
  code: 'stable_code',
  message: 'Internal diagnostic message.',
  cause: new Error('root cause'),
  details: { private: true },
  publicDetails: { safe: true },
  traceId: 'trace_123',
} as const;

describe('semantic error factories', () => {
  it.each([
    [configError, 'ConfigError', 500],
    [authError, 'AuthError', 401],
    [permissionError, 'PermissionError', 403],
    [notFoundError, 'NotFoundError', 404],
    [conflictError, 'ConflictError', 409],
    [rateLimitError, 'RateLimitError', 429],
    [invariantViolationError, 'InvariantViolationError', 500],
    [unexpectedError, 'UnexpectedError', 500],
  ] as const)('owns the %s kind and status', (factory, kind, status) => {
    expect(factory(input)).toMatchObject({
      tag: 'AppError',
      kind,
      status,
      code: input.code,
      cause: input.cause,
      details: input.details,
      publicDetails: input.publicDetails,
      traceId: input.traceId,
    });
  });

  it.each([400, 413, 415, 422] as const)(
    'allows validation status %s',
    (status) => {
      expect(validationError({ ...input, status })).toMatchObject({
        kind: 'ValidationError',
        status,
      });
    },
  );

  it.each([408, 500, 502, 503, 504] as const)(
    'allows external-service status %s',
    (status) => {
      expect(externalServiceError({ ...input, status })).toMatchObject({
        kind: 'ExternalServiceError',
        status,
      });
    },
  );

  it.each([500, 503] as const)('allows database status %s', (status) => {
    expect(databaseError({ ...input, status })).toMatchObject({
      kind: 'DatabaseError',
      status,
    });
  });

  it('uses safe defaults without exposing the internal message', () => {
    const error = unexpectedError({
      code: 'unexpected',
      message: 'database password appeared here',
    });

    expect(error.safeMessage).toBe('An unexpected error occurred.');
    expect(error.safeMessage).not.toContain('password');
  });
});
