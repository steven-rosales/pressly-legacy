import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  StartScheduleIdempotency,
  StartScheduleReplay,
  StartScheduleWorkEventCommand,
} from './execute.ts';
import type { StartScheduleResult } from './types.ts';

export type StoredStartScheduleWorkEvent =
  StoredCellWorkEvent<StartScheduleResult>;

export const serializeStartScheduleWorkEventCommand = (
  command: StartScheduleWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: {
    entityType: command.target.entityType,
    entityId: command.target.entityId,
  },
  expectedVersion: null,
  payload: {
    expectedOutputPlanHash: command.payload.expectedOutputPlanHash,
  },
});

export const serializeStartScheduleResult = (
  value: StartScheduleResult,
): JsonObject => ({
  scheduleRunId: value.scheduleRunId,
  productionRunId: value.productionRunId,
  productionBatchIds: [...value.productionBatchIds],
  queueVersion: value.queueVersion,
  startedAt: value.startedAt,
  replayed: value.replayed,
});

const replayedResult = (value: StartScheduleResult): StartScheduleResult => ({
  ...value,
  replayed: true,
});

export const resolveStartScheduleReplay = (
  stored: StoredStartScheduleWorkEvent | null,
  expected: StartScheduleWorkEventCommand,
): StartScheduleReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeStartScheduleWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const startScheduleIdempotency: StartScheduleIdempotency<StoredStartScheduleWorkEvent> =
  Object.freeze({ resolveReplay: resolveStartScheduleReplay });
