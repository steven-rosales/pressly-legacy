import { makeAppError } from '@pressly/errors/app-error';
import * as result from '@pressly/cells/result';
import { describe, expect, it } from 'vitest';
import { expectErrCode, expectOk } from '../src/result.ts';

describe('result test assertions', () => {
  it('reads ok values independently of the failure representation', () => {
    const actual = result.ok<number>(42);

    expect(expectOk(actual)).toBe(42);
  });

  it('asserts typed coded failures without requiring throwable errors', () => {
    const failure = {
      code: 'expected_business_failure',
      reason: 'The command conflicts with current state.',
    } as const;

    expect(expectErrCode(result.err(failure), failure.code)).toBe(failure);
  });

  it('remains compatible with AppError failures', () => {
    const error = makeAppError({
      kind: 'ConflictError',
      code: 'state_changed',
      message: 'State changed.',
      status: 409,
    });

    expect(expectErrCode(result.err(error), error.code)).toBe(error);
    expect(() => expectOk(result.err(error))).toThrow();
  });
});
