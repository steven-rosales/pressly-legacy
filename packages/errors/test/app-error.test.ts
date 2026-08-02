import { describe, expect, it } from 'vitest';
import {
  isAppError,
  mapUnknownError,
  makeAppError,
  normalizeUnknownError,
} from '../src/app-error.js';

describe('AppError', () => {
  it('creates a throwable structured app error', () => {
    const cause = new Error('parser failed');
    const error = makeAppError({
      kind: 'ValidationError',
      code: 'invalid_input',
      message: 'Invalid input.',
      safeMessage: 'Please check your input.',
      status: 400,
      details: { field: 'email' },
      publicDetails: { issue: 'invalid_email' },
      cause,
      traceId: 'trace_123',
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.tag).toBe('AppError');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('invalid_input');
    expect(error.safeMessage).toBe('Please check your input.');
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
    expect(error.publicDetails).toEqual({ issue: 'invalid_email' });
    expect(error.cause).toBe(cause);
    expect(error.traceId).toBe('trace_123');
    expect(isAppError(error)).toBe(true);
    expect(JSON.stringify(error)).not.toContain('"field"');
    expect(JSON.stringify(error)).toContain('invalid_email');
  });

  it('rejects malformed tagged errors at trust boundaries', () => {
    const error = Object.assign(new Error('malformed'), {
      tag: 'AppError',
      kind: 'AnythingError',
      code: 'malformed',
      safeMessage: 'Malformed.',
      status: 418,
    });

    expect(isAppError(error)).toBe(false);
    expect(normalizeUnknownError(error)).toMatchObject({
      kind: 'UnexpectedError',
      code: 'unexpected_error',
      status: 500,
    });
  });

  it('returns existing AppError from normalizedUnknownError', () => {
    const error = makeAppError({
      kind: 'ConflictError',
      code: 'already_exists',
      message: 'Already exists.',
      status: 409,
    });

    expect(normalizeUnknownError(error)).toBe(error);
  });

  it('preserves AppError values while mapping unknown failures', () => {
    const existing = makeAppError({
      kind: 'NotFoundError',
      code: 'missing',
      message: 'Missing.',
      status: 404,
    });
    const mapped = makeAppError({
      kind: 'DatabaseError',
      code: 'database_failed',
      message: 'Database failed.',
      status: 503,
    });
    const map = () => mapped;

    expect(mapUnknownError(existing, map)).toBe(existing);
    expect(mapUnknownError(new Error('boom'), map)).toBe(mapped);
  });

  it('normalizes ordinary errors', () => {
    const error = normalizeUnknownError(new Error('boom'));

    expect(error.tag).toBe('AppError');
    expect(error.kind).toBe('UnexpectedError');
    expect(error.code).toBe('unexpected_error');
    expect(error.status).toBe(500);
  });

  it('normalizes non-error thrown values', () => {
    const error = normalizeUnknownError('boom');

    expect(error.tag).toBe('AppError');
    expect(error.kind).toBe('UnexpectedError');
    expect(error.code).toBe('unknown_thrown_value');
  });
});
