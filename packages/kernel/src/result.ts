export type Ok<T> = Readonly<{
  tag: 'ok';
  value: T;
}>;

export type Err<E> = Readonly<{
  tag: 'err';
  error: E;
}>;

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({
  tag: 'ok',
  value,
});

export const err = <E>(error: E): Err<E> => ({
  tag: 'err',
  error,
});

export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> =>
  result.tag === 'ok';

export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  result.tag === 'err';

export const map =
  <A, B>(f: (a: A) => B) =>
  <E>(result: Result<A, E>): Result<B, E> =>
    isOk(result) ? ok(f(result.value)) : result;

export const andThen =
  <A, B, E2>(f: (a: A) => Result<B, E2>) =>
  <E1>(result: Result<A, E1>): Result<B, E1 | E2> =>
    isOk(result) ? f(result.value) : result;

export const mapError =
  <E1, E2>(f: (error: E1) => E2) =>
  <T>(result: Result<T, E1>): Result<T, E2> =>
    isOk(result) ? result : err(f(result.error));

export const match =
  <T, E, R>(cases: { ok: (value: T) => R; err: (error: E) => R }) =>
  (result: Result<T, E>): R =>
    isOk(result) ? cases.ok(result.value) : cases.err(result.error);

export const collect = <T, E>(
  results: readonly Result<T, E>[],
): Result<readonly T[], E> => {
  const values: T[] = [];

  for (const result of results) {
    if (isErr(result)) return result;
    values.push(result.value);
  }

  return ok(values);
};

export const unwrapOr =
  <T>(fallback: T) =>
  <E>(result: Result<T, E>): T =>
    isOk(result) ? result.value : fallback;

export const unwrapOrElse =
  <E, T>(fallback: (error: E) => T) =>
  (result: Result<T, E>): T =>
    isOk(result) ? result.value : fallback(result.error);

export const recover =
  <E, T>(f: (error: E) => T) =>
  (result: Result<T, E>): Result<T, never> =>
    isOk(result) ? ok(result.value) : ok(f(result.error));

export const orElse =
  <E1, T, E2>(f: (error: E1) => Result<T, E2>) =>
  (result: Result<T, E1>): Result<T, E2> =>
    isOk(result) ? ok(result.value) : f(result.error);

export const tap =
  <T>(f: (value: T) => void) =>
  <E>(result: Result<T, E>): Result<T, E> => {
    if (isOk(result)) f(result.value);
    return result;
  };

export const tapError =
  <E>(f: (error: E) => void) =>
  <T>(result: Result<T, E>): Result<T, E> => {
    if (isErr(result)) f(result.error);
    return result;
  };

export const fromNullable = <T, E>(
  value: T | null | undefined,
  onNullish: () => E,
): Result<NonNullable<T>, E> =>
  value == null ? err(onNullish()) : ok(value as NonNullable<T>);

export const fromPredicate =
  <T, E>(predicate: (value: T) => boolean, onFalse: (value: T) => E) =>
  (value: T): Result<T, E> =>
    predicate(value) ? ok(value) : err(onFalse(value));

export const fromThrowable = <T, E>(
  thunk: () => T,
  onThrow: (error: unknown) => E,
): Result<T, E> => {
  try {
    return ok(thunk());
  } catch (error) {
    return err(onThrow(error));
  }
};

export const fromPromise = async <T, E>(
  promise: Promise<T>,
  onReject: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await promise);
  } catch (error) {
    return err(onReject(error));
  }
};

export const fromAsyncThrowable = async <T, E>(
  thunk: () => Promise<T>,
  onThrow: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    return ok(await thunk());
  } catch (error) {
    return err(onThrow(error));
  }
};
