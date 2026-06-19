import { describe, expect, it } from 'vitest';
import { option, pipe, result, spec, workflow } from './index.ts';

describe('kernel public API', () => {
  it('uses lower-case option and result namespaces', () => {
    const maybeValue = pipe(
      option.some(2),
      option.map((value: number) => value + 1),
      option.andThen((value) =>
        value > 2 ? option.some(value * 2) : option.none,
      ),
    );

    expect(
      option.match({
        some: (value: number) => value,
        none: () => 0,
      })(maybeValue),
    ).toBe(6);

    const calculation = pipe(
      result.ok(2),
      result.map((value: number) => value + 1),
      result.andThen((value) => result.ok(value * 2)),
    );

    expect(
      result.match({
        ok: (value: number) => value,
        err: () => 0,
      })(calculation),
    ).toBe(6);
  });

  it('uses lower-case spec and workflow namespaces', async () => {
    const positive = spec.spec<number, string>(
      'positive',
      (value) => value > 0,
      () => 'must be positive',
    );
    const even = spec.spec<number, string>(
      'even',
      (value) => value % 2 === 0,
      () => 'must be even',
    );

    expect(spec.and('valid count', positive, even).check(4)).toEqual(
      result.ok(4),
    );

    const double = workflow.step<
      Readonly<{ multiplier: number }>,
      number,
      number,
      string
    >('double', async (_env, input) => result.ok(input * 2));
    const multiply = workflow.step<
      Readonly<{ multiplier: number }>,
      number,
      number,
      string
    >('multiply', async (env, input) => result.ok(input * env.multiplier));
    const events: unknown[] = [];

    const process = pipe(
      double,
      workflow.chain(multiply),
      workflow.around((event) => events.push(event)),
    );

    expect(await process.run({ multiplier: 3 }, 2)).toEqual(result.ok(12));
    expect(events).toHaveLength(2);
  });
});
