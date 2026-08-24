import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  AdvanceStageIdempotency,
  AdvanceStageReplay,
  AdvanceStageWorkEventCommand,
} from './execute.ts';
import type { AdvanceStageResult } from './types.ts';

export type StoredAdvanceStageWorkEvent =
  StoredCellWorkEvent<AdvanceStageResult>;

const confirmationJson = (
  confirmation: Readonly<{
    observedAt: string;
    confirmationHash: string;
  }>,
): JsonObject => ({
  observedAt: confirmation.observedAt,
  confirmationHash: confirmation.confirmationHash,
});

export const serializeAdvanceStageWorkEventCommand = (
  command: AdvanceStageWorkEventCommand,
): JsonObject => {
  const payload: JsonObject =
    command.payload.transition === 'complete'
      ? {
          transition: command.payload.transition,
          confirmation:
            command.payload.confirmation === null
              ? null
              : confirmationJson(command.payload.confirmation),
        }
      : {
          transition: command.payload.transition,
          ...(command.payload.confirmation === undefined
            ? {}
            : {
                confirmation: confirmationJson(command.payload.confirmation),
              }),
        };

  return {
    operation: command.operation,
    locationId: command.locationId,
    actorId: command.actorId,
    target: {
      entityType: command.target.entityType,
      entityId: command.target.entityId,
    },
    expectedVersion: command.expectedVersion,
    payload,
  };
};

const replayedResult = (result: AdvanceStageResult): AdvanceStageResult =>
  'status' in result ? result : { ...result, replayed: true };

export const resolveAdvanceStageReplay = (
  stored: StoredAdvanceStageWorkEvent | null,
  expected: AdvanceStageWorkEventCommand,
): AdvanceStageReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeAdvanceStageWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const advanceStageIdempotency: AdvanceStageIdempotency<StoredAdvanceStageWorkEvent> =
  Object.freeze({ resolveReplay: resolveAdvanceStageReplay });
