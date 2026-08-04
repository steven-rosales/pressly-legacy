import { describe, expect, it } from 'vitest';
import { toolingError } from '../src/tooling-error.mjs';

describe('toolingError', () => {
  it('owns a coded checkout-safe Error with an optional cause', () => {
    const cause = Object.freeze({ source: 'fixture' });
    const error = toolingError({
      code: 'invalid_tooling_fixture',
      message: 'The tooling fixture is invalid.',
      cause,
    });

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      tag: 'ToolingError',
      code: 'invalid_tooling_fixture',
      message: 'The tooling fixture is invalid.',
      cause,
    });
  });

  it('preserves TypeError semantics when a type contract is invalid', () => {
    const error = toolingError({
      code: 'invalid_tooling_type',
      message: 'The tooling type is invalid.',
      nativeKind: 'TypeError',
    });

    expect(error).toBeInstanceOf(TypeError);
  });

  it('preserves RangeError semantics when a tooling range is invalid', () => {
    const error = toolingError({
      code: 'invalid_tooling_range',
      message: 'The tooling range is invalid.',
      nativeKind: 'RangeError',
    });

    expect(error).toBeInstanceOf(RangeError);
  });
});
