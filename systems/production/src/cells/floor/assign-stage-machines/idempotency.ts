import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  AssignStageMachinesIdempotency,
  AssignStageMachinesReplay,
  AssignStageMachinesWorkEventCommand,
} from './execute.ts';
import type { AssignStageMachinesResult } from './types.ts';

export type StoredAssignStageMachinesWorkEvent =
  StoredCellWorkEvent<AssignStageMachinesResult>;

export const serializeAssignStageMachinesWorkEventCommand = (
  command: AssignStageMachinesWorkEventCommand,
): JsonObject => ({
  operation: command.operation,
  locationId: command.locationId,
  actorId: command.actorId,
  target: { ...command.target },
  expectedVersion: command.expectedVersion,
  payload: { machineIds: [...command.payload.machineIds] },
});

export const resolveAssignStageMachinesReplay = (
  stored: StoredAssignStageMachinesWorkEvent | null,
  expected: AssignStageMachinesWorkEventCommand,
): AssignStageMachinesReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeAssignStageMachinesWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return {
    kind: 'replay',
    result: {
      ...stored.result,
      replayed: true,
    },
  };
};

export const assignStageMachinesIdempotency: AssignStageMachinesIdempotency<StoredAssignStageMachinesWorkEvent> =
  Object.freeze({ resolveReplay: resolveAssignStageMachinesReplay });
