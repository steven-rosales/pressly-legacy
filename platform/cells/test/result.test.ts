import { describe, expect, it } from 'vitest';
import * as result from '../src/result.ts';
import type { Err, Ok, Result } from '../src/result.ts';

describe('result', () => {
  it('composes typed successful and failed outcomes', () => {
    const typedOk: Ok<number> = result.ok(2);
    const typedErr: Err<string> = result.err('failed');
    const typedResult: Result<number, string> = typedErr;
    const calculation = result.andThen((value: number) => result.ok(value * 2))(
      result.map((value: number) => value + 1)(typedOk),
    );

    expect(
      result.match({
        ok: (value: number) => value,
        err: () => 0,
      })(calculation),
    ).toBe(6);
    expect(typedResult).toEqual(result.err('failed'));
  });
});
