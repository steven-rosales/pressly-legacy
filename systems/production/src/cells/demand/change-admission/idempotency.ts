import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ChangeAdmissionIdempotency,
  ChangeAdmissionReplay,
  ChangeAdmissionWorkEventCommand,
} from './execute.ts';
import type { ChangeAdmissionResult } from './types.ts';

export type StoredChangeAdmissionWorkEvent =
  StoredCellWorkEvent<ChangeAdmissionResult>;

export const serializeChangeAdmissionWorkEventCommand = (
  command: ChangeAdmissionWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: command.expectedVersion,
  payload: { target: command.payload.target },
});

const replayedResult = (
  result: ChangeAdmissionResult,
): ChangeAdmissionResult => ({ ...result, replayed: true });

export const resolveChangeAdmissionReplay = (
  stored: StoredChangeAdmissionWorkEvent | null,
  expected: ChangeAdmissionWorkEventCommand,
): ChangeAdmissionReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeChangeAdmissionWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const changeAdmissionIdempotency: ChangeAdmissionIdempotency<StoredChangeAdmissionWorkEvent> =
  Object.freeze({ resolveReplay: resolveChangeAdmissionReplay });
