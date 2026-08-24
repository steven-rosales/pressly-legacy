import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { ScheduleProposal } from '../../../model/production-schedule/model.ts';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  CreateScheduleIdempotency,
  CreateScheduleReplay,
  CreateScheduleWorkEventCommand,
} from './execute.ts';
export type StoredCreateScheduleWorkEvent =
  StoredCellWorkEvent<ScheduleProposal>;
export const serializeCreateScheduleCommand = (
  command: CreateScheduleWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: null,
  payload: { ...command.payload },
});
export const resolveCreateScheduleReplay = (
  stored: StoredCreateScheduleWorkEvent | null,
  expected: CreateScheduleWorkEventCommand,
): CreateScheduleReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeCreateScheduleCommand(expected))
  )
    return { kind: 'conflict' };
  return {
    kind: 'replay',
    result: stored.result,
  };
};
export const createScheduleIdempotency: CreateScheduleIdempotency<StoredCreateScheduleWorkEvent> =
  Object.freeze({ resolveReplay: resolveCreateScheduleReplay });
