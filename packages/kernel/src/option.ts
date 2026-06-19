export type Some<T> = Readonly<{
  tag: 'some';
  value: T;
}>;

export type None = Readonly<{
  tag: 'none';
}>;

export type Option<T> = Some<T> | None;

export const some = <T>(value: T): Some<T> => ({
  tag: 'some',
  value,
});

export const none: None = {
  tag: 'none',
};

export const isSome = <T>(option: Option<T>): option is Some<T> =>
  option.tag === 'some';

export const isNone = <T>(option: Option<T>): option is None =>
  option.tag === 'none';

export const fromNullable = <T>(
  value: T | null | undefined,
): Option<NonNullable<T>> =>
  value == null ? none : some(value as NonNullable<T>);

export const fromPredicate =
  <T>(predicate: (value: T) => boolean) =>
  (value: T): Option<T> =>
    predicate(value) ? some(value) : none;

export const map =
  <A, B>(f: (a: A) => B) =>
  (option: Option<A>): Option<B> =>
    isSome(option) ? some(f(option.value)) : none;

export const andThen =
  <A, B>(f: (a: A) => Option<B>) =>
  (option: Option<A>): Option<B> =>
    isSome(option) ? f(option.value) : none;

export const filter =
  <T>(predicate: (value: T) => boolean) =>
  (option: Option<T>): Option<T> =>
    isSome(option) && predicate(option.value) ? option : none;

export const match =
  <T, R>(cases: { some: (value: T) => R; none: () => R }) =>
  (option: Option<T>): R =>
    isSome(option) ? cases.some(option.value) : cases.none();

export const getOrElse =
  <T>(fallback: () => T) =>
  (option: Option<T>): T =>
    isSome(option) ? option.value : fallback();

export const toNullable = <T>(option: Option<T>): T | null =>
  isSome(option) ? option.value : null;

export const toUndefined = <T>(option: Option<T>): T | undefined =>
  isSome(option) ? option.value : undefined;

export const collect = <T>(
  options: readonly Option<T>[],
): Option<readonly T[]> => {
  const values: T[] = [];

  for (const option of options) {
    if (isNone(option)) return none;
    values.push(option.value);
  }

  return some(values);
};
