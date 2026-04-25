export type Ok<A> = Readonly<{ ok: true; value: A }>;

export type Err<E> = Readonly<{ ok: false; error: E }>;

export type Result<A, E> = Ok<A> | Err<E>;

export const ok = <A>(value: A): Ok<A> => ({ ok: true, value });

export const err = <E>(error: E): Err<E> => ({ ok: false, error });

export const mapResult = <A, B, E>(
  result: Result<A, E>,
  transform: (value: A) => B,
): Result<B, E> => (result.ok ? ok(transform(result.value)) : result);

export const mapError = <A, E1, E2>(
  result: Result<A, E1>,
  transform: (error: E1) => E2,
): Result<A, E2> => (result.ok ? result : err(transform(result.error)));

export const andThen = <A, B, E>(
  result: Result<A, E>,
  transform: (value: A) => Result<B, E>,
): Result<B, E> => (result.ok ? transform(result.value) : result);
