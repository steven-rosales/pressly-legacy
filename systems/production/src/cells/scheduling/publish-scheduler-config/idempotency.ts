import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  PublishSchedulerConfigIdempotency,
  PublishSchedulerConfigReplay,
  PublishSchedulerConfigWorkEventCommand,
} from './execute.ts';
import type { SchedulerConfig } from './types.ts';

export type StoredPublishSchedulerConfigWorkEvent =
  StoredCellWorkEvent<SchedulerConfig>;

export const serializePublishSchedulerConfigWorkEventCommand = (
  command: PublishSchedulerConfigWorkEventCommand,
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
    pulseMinutes: command.payload.pulseMinutes,
    foldLbsPerFolderMinute: command.payload.foldLbsPerFolderMinute,
    stageFitAssertion: {
      sortingFits: command.payload.stageFitAssertion.sortingFits,
      washingFits: command.payload.stageFitAssertion.washingFits,
      dryingFits: command.payload.stageFitAssertion.dryingFits,
    },
  },
});

export const resolvePublishSchedulerConfigReplay = (
  stored: StoredPublishSchedulerConfigWorkEvent | null,
  expected: PublishSchedulerConfigWorkEventCommand,
): PublishSchedulerConfigReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializePublishSchedulerConfigWorkEventCommand(expected))
  )
    return { kind: 'conflict' };

  const replayed =
    'replayed' in stored.result
      ? { ...stored.result, replayed: true }
      : stored.result;
  return {
    kind: 'replay',
    result: replayed,
  };
};

export const publishSchedulerConfigIdempotency: PublishSchedulerConfigIdempotency<StoredPublishSchedulerConfigWorkEvent> =
  Object.freeze({ resolveReplay: resolvePublishSchedulerConfigReplay });
