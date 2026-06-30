import { describe, expect, it } from 'vitest';
import {
  option,
  pipe,
  result,
  spec,
  workflow,
  type Err,
  type None,
  type Ok,
  type Option,
  type Result,
  type Some,
  type Spec,
  type Step,
  type WorkflowEvent,
} from '../src/index.ts';

describe('kernel public API', () => {
  it('uses lower-case option and result namespaces', () => {
    const typedSome: Some<number> = option.some(2);
    const typedNone: None = option.none;
    const maybeValue: Option<number> = pipe(
      typedSome,
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
    expect(typedNone).toEqual(option.none);

    const typedOk: Ok<number> = result.ok(2);
    const typedErr: Err<string> = result.err('failed');
    const typedResult: Result<number, string> = typedErr;
    const calculation = pipe(
      typedOk,
      result.map((value: number) => value + 1),
      result.andThen((value) => result.ok(value * 2)),
    );

    expect(
      result.match({
        ok: (value: number) => value,
        err: () => 0,
      })(calculation),
    ).toBe(6);
    expect(typedResult).toEqual(result.err('failed'));
  });

  it('uses lower-case spec and workflow namespaces', async () => {
    const positive: Spec<number, string> = spec.spec<number, string>(
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

    const double: Step<
      Readonly<{ multiplier: number }>,
      number,
      number,
      string
    > = workflow.step<Readonly<{ multiplier: number }>, number, number, string>(
      'double',
      async (_env, input) => result.ok(input * 2),
    );
    const multiply = workflow.step<
      Readonly<{ multiplier: number }>,
      number,
      number,
      string
    >('multiply', async (env, input) => result.ok(input * env.multiplier));
    const events: WorkflowEvent<number, number, string>[] = [];

    const process = pipe(
      double,
      workflow.chain(multiply),
      workflow.around((event) => events.push(event)),
    );

    expect(await process.run({ multiplier: 3 }, 2)).toEqual(result.ok(12));
    expect(events).toHaveLength(2);
  });
});
