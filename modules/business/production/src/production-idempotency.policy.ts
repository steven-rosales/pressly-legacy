import type {
  StoredWorkEvent,
  WorkEventCommandIdentity,
} from './production.port.ts';

type WorkEventCommandInput = Readonly<{
  operation: string;
  locationId: string;
  actorId: string;
  entityType: string;
  entityId?: string | null;
  expectedVersion?: number | null;
  payload?: Readonly<Record<string, unknown>>;
}>;

export type WorkEventReplay<Result extends Readonly<Record<string, unknown>>> =
  | Readonly<{ tag: 'miss' }>
  | Readonly<{ tag: 'conflict' }>
  | Readonly<{ tag: 'replay'; result: Result }>;

const canonicalize = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);

  return Object.fromEntries(
    Object.entries(value as Readonly<Record<string, unknown>>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
};

const sameCommand = (
  stored: unknown,
  expected: WorkEventCommandIdentity,
): boolean =>
  JSON.stringify(canonicalize(stored)) ===
  JSON.stringify(canonicalize(expected));

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const markReplayed = <Result extends Readonly<Record<string, unknown>>>(
  stored: Result,
): Result =>
  ('replayed' in stored ? { ...stored, replayed: true } : stored) as Result;

export const defineWorkEventCommand = (
  input: WorkEventCommandInput,
): WorkEventCommandIdentity => ({
  operation: input.operation,
  locationId: input.locationId,
  actorId: input.actorId,
  target: {
    entityType: input.entityType,
    entityId: input.entityId ?? null,
  },
  expectedVersion: input.expectedVersion ?? null,
  payload: input.payload ?? {},
});

export const resolveWorkEventReplay = <
  Result extends Readonly<Record<string, unknown>>,
>(
  stored: StoredWorkEvent | null,
  expected: WorkEventCommandIdentity,
): WorkEventReplay<Result> => {
  if (stored === null) return { tag: 'miss' };
  if (
    !stored.valid ||
    !sameCommand(stored.command, expected) ||
    !isRecord(stored.result)
  )
    return { tag: 'conflict' };

  return { tag: 'replay', result: markReplayed(stored.result as Result) };
};
