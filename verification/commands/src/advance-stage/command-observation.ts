export type CanonicalScalar = boolean | number | string | null;

export type CanonicalValue =
  | CanonicalScalar
  | readonly CanonicalValue[]
  | Readonly<{ [key: string]: CanonicalValue }>;

export type StateDelta<State> = Readonly<{
  before: State;
  after: State;
}>;

export type CommandObservation<
  Outcome,
  State,
  AuditEvent,
  IdempotencyReceipt,
  Signal,
> = Readonly<{
  outcome: Outcome;
  stateDelta: StateDelta<State>;
  auditEvents: readonly AuditEvent[];
  idempotencyReceipt: IdempotencyReceipt | null;
  liveRevision: Readonly<{ before: number; after: number }>;
  signals: readonly Signal[];
}>;

const canonicalEntries = (
  value: Readonly<Record<string, unknown>>,
): readonly (readonly [string, CanonicalValue])[] =>
  Object.freeze(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .flatMap(([key, entry]) => {
        const canonical = toCanonicalValue(entry);
        return canonical === undefined ? [] : [[key, canonical] as const];
      }),
  );

export const toCanonicalValue = (
  value: unknown,
): CanonicalValue | undefined => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value))
    return Object.freeze(
      value.flatMap((entry) => {
        const canonical = toCanonicalValue(entry);
        return canonical === undefined ? [] : [canonical];
      }),
    );
  if (typeof value !== 'object') return undefined;

  return Object.freeze(
    Object.fromEntries(
      canonicalEntries(Object.fromEntries(Object.entries(value))),
    ),
  );
};
