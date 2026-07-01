import { describe, expect, it } from 'vitest';
import {
  isAppError,
  makeAppError,
  normalizeUnknownError,
} from '../src/app-error.js';

describe('AppError', () => {
  it('creates a throwable structured app error', () => {
    const error = makeAppError({
      kind: 'ValidationError',
      code: 'invalid_input',
      message: 'Invalid input.',
      safeMessage: 'Please check your input.',
      status: 400,
      details: { field: 'email' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.tag).toBe('AppError');
    expect(error.name).toBe('ValidationError');
    expect(error.code).toBe('invalid_input');
    expect(error.safeMessage).toBe('Please check your input.');
    expect(error.status).toBe(400);
    expect(error.details).toEqual({ field: 'email' });
    expect(isAppError(error)).toBe(true);
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
