import { describe, expect, it } from 'vitest';
import { makeAppError } from '../src/app-error.js';
import { presentAppError } from '../src/presentation.js';

describe('presentAppError', () => {
  it('formats the safe message and diagnostic fields', () => {
    const error = makeAppError({
      kind: 'ValidationError',
      code: 'invalid_input',
      message: 'Email is invalid.',
      safeMessage: 'Please check your input.',
      status: 400,
    });

    expect(presentAppError(error)).toBe(
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
