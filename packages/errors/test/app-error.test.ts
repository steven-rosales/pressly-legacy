import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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

    assert.equal(error instanceof Error, true);
    assert.equal(error.tag, 'AppError');
    assert.equal(error.name, 'ValidationError');
    assert.equal(error.code, 'invalid_input');
    assert.equal(error.safeMessage, 'Please check your input.');
    assert.equal(error.status, 400);
    assert.deepEqual(error.details, { field: 'email' });
    assert.equal(isAppError(error), true);
  });

  it('returns existing AppError from normalizedUnknownError', () => {
    const error = makeAppError({
      kind: 'ConflictError',
      code: 'already_exists',
      message: 'Already exists.',
      status: 409,
    });

    assert.equal(normalizeUnknownError(error), error);
  });

  it('normalizes ordinary errors', () => {
    const error = normalizeUnknownError(new Error('boom'));

    assert.equal(error.tag, 'AppError');
    assert.equal(error.kind, 'UnexpectedError');
    assert.equal(error.code, 'unexpected_error');
    assert.equal(error.status, 500);
  });

  it('normalizes non-error thrown values', () => {
    const error = normalizeUnknownError('boom');

    assert.equal(error.tag, 'AppError');
    assert.equal(error.kind, 'UnexpectedError');
    assert.equal(error.code, 'unknown_thrown_value');
  });
});
