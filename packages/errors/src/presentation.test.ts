import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeAppError } from './app-error.js';
import { presentAppError } from './presentation.js';

describe('presentAppError', () => {
  it('formats the safe message and diagnostic fields', () => {
    const error = makeAppError({
      kind: 'ValidationError',
      code: 'invalid_input',
      message: 'Email is invalid.',
      safeMessage: 'Please check your input.',
      status: 400,
    });

    assert.equal(
      presentAppError(error),
      [
        'Please check your input.',
        '',
        'code: invalid_input',
        'kind: ValidationError',
        'message: Email is invalid.',
      ].join('\n'),
    );
  });
});
