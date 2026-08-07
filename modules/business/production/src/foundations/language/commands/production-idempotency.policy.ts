import type {
  StoredWorkEvent,
  WorkEventCommandIdentity,
} from './production-command.model.ts';
import { canonicalJson, isJsonObject, type JsonObject } from '@pressly/codec';

type WorkEventCommandInput = Readonly<{
  operation: string;
  locationId: string;
  actorId: string;
  entityType: string;
  entityId?: string | null;
  expectedVersion?: number | null;
  payload?: JsonObject;
}>;

export type WorkEventReplay<Result extends Readonly<Record<string, unknown>>> =
  | Readonly<{ tag: 'miss' }>
  | Readonly<{ tag: 'conflict' }>
  | Readonly<{ tag: 'replay'; result: Result }>;

const sameCommand = (
  stored: JsonObject,
  expected: WorkEventCommandIdentity,
): boolean => canonicalJson(stored) === canonicalJson(expected);

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
    !isJsonObject(stored.result)
  )
    return { tag: 'conflict' };

  return { tag: 'replay', result: markReplayed(stored.result as Result) };
};
