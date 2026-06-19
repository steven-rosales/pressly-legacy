export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, ab: (a: A) => B): B;
export function pipe<A, B, C>(value: A, ab: (a: A) => B, bc: (b: B) => C): C;
export function pipe<A, B, C, D>(
  value: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
): D;
export function pipe<A, B, C, D, E>(
  value: A,
  ab: (a: A) => B,
  bc: (b: B) => C,
  cd: (c: C) => D,
  de: (d: D) => E,
): E;
export function pipe(
  value: unknown,
  ...fns: readonly ((value: unknown) => unknown)[]
): unknown {
  return fns.reduce((current, f) => f(current), value);
}

export const flow =
  <A extends readonly unknown[], B>(ab: (...args: A) => B) =>
  <C>(bc: (b: B) => C) =>
  (...args: A): C =>
    bc(ab(...args));
