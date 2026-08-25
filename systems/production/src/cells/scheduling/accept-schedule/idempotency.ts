import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  AcceptScheduleIdempotency,
  AcceptScheduleReplay,
  AcceptScheduleWorkEventCommand,
} from './execute.ts';
import type { AcceptScheduleResult } from './types.ts';

export type StoredAcceptScheduleWorkEvent =
  StoredCellWorkEvent<AcceptScheduleResult>;

export const serializeAcceptScheduleWorkEventCommand = (
  command: AcceptScheduleWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: command.expectedVersion,
  payload: {
    expectedOutputPlanHash: command.payload.expectedOutputPlanHash,
    acknowledgedWarningCodes: [...command.payload.acknowledgedWarningCodes],
  },
});

const replayedResult = (
  result: AcceptScheduleResult,
): AcceptScheduleResult => ({ ...result, replayed: true });

export const resolveAcceptScheduleReplay = (
  stored: StoredAcceptScheduleWorkEvent | null,
  expected: AcceptScheduleWorkEventCommand,
): AcceptScheduleReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeAcceptScheduleWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const acceptScheduleIdempotency: AcceptScheduleIdempotency<StoredAcceptScheduleWorkEvent> =
  Object.freeze({ resolveReplay: resolveAcceptScheduleReplay });
