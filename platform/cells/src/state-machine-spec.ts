import { err, isErr, isOk, ok, type Result } from './result.ts';

export type Spec<A, E> = Readonly<{
  name: string;
  check: (value: A) => Result<A, E>;
}>;

export const spec = <A, E>(
  name: string,
  predicate: (value: A) => boolean,
  onFail: (value: A) => E,
): Spec<A, E> => ({
  name,
  check: (value) => (predicate(value) ? ok(value) : err(onFail(value))),
});

export const and = <A, E>(
  name: string,
  ...specs: readonly Spec<A, E>[]
): Spec<A, E> => ({
  name,
  check: (value) => {
    for (const current of specs) {
      const result = current.check(value);
      if (isErr(result)) return result;
    }
    return ok(value);
  },
});

export const or = <A, E>(
  name: string,
  first: Spec<A, E>,
  ...rest: readonly Spec<A, E>[]
): Spec<A, E> => ({
  name,
  check: (value) => {
    let last = first.check(value);

    if (isOk(last)) return ok(value);

    for (const current of rest) {
      const result = current.check(value);

      if (isOk(result)) return ok(value);

      last = result;
    }

    return last;
  },
});

export const not = <A, E>(
  name: string,
  current: Spec<A, E>,
  onFail: (value: A) => E,
): Spec<A, E> => ({
  name,
  check: (value) =>
    isErr(current.check(value)) ? ok(value) : err(onFail(value)),
});

export const prop = <A, K extends keyof A, E>(
  key: K,
  inner: Spec<A[K], E>,
): Spec<A, E> => ({
  name: `${String(key)}.${inner.name}`,
  check: (value) => {
    const result = inner.check(value[key]);
    return isOk(result) ? ok(value) : result;
  },
});
