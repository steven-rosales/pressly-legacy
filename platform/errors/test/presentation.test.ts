import { describe, expect, it } from 'vitest';
import { makeAppError } from '../src/app-error.js';
import { presentAppError } from '../src/presentation.js';

describe('presentAppError', () => {
  const error = makeAppError({
    kind: 'ValidationError',
    code: 'invalid_input',
    message: 'Email is invalid.',
    safeMessage: 'Please check your input.',
    status: 400,
    traceId: 'trace_123',
  });

  it('presents only the safe message by default', () => {
    expect(presentAppError(error)).toBe('Please check your input.');
  });

  it('includes diagnostic fields only when explicitly requested', () => {
    expect(presentAppError(error, { diagnostics: true })).toBe(
      [
        'Please check your input.',
        '',
        'code: invalid_input',
        'kind: ValidationError',
        'status: 400',
        'message: Email is invalid.',
        'traceId: trace_123',
      ].join('\n'),
    );
  });
});
