import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  RecordOrderIntakeIdempotency,
  RecordOrderIntakeReplay,
  RecordOrderIntakeWorkEventCommand,
} from './execute.ts';
import type { RecordOrderIntakeResult } from './types.ts';

export type StoredRecordOrderIntakeWorkEvent =
  StoredCellWorkEvent<RecordOrderIntakeResult>;

export const serializeRecordOrderIntakeWorkEventCommand = (
  command: RecordOrderIntakeWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: command.expectedVersion,
  payload: { bagCount: command.payload.bagCount },
});

const replayedResult = (
  result: RecordOrderIntakeResult,
): RecordOrderIntakeResult => ({ ...result, replayed: true });

export const resolveRecordOrderIntakeReplay = (
  stored: StoredRecordOrderIntakeWorkEvent | null,
  expected: RecordOrderIntakeWorkEventCommand,
): RecordOrderIntakeReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeRecordOrderIntakeWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const recordOrderIntakeIdempotency: RecordOrderIntakeIdempotency<StoredRecordOrderIntakeWorkEvent> =
  Object.freeze({ resolveReplay: resolveRecordOrderIntakeReplay });
