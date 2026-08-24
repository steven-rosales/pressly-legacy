import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ManageResourcesIdempotency,
  ManageResourcesReplay,
  ManageResourcesWorkEventCommand,
} from './execute.ts';
import type { ManageResourcesResult } from './types.ts';

export type StoredManageResourcesWorkEvent =
  StoredCellWorkEvent<ManageResourcesResult>;

export const serializeManageResourcesWorkEventCommand = (
  command: ManageResourcesWorkEventCommand,
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
    dryRun: command.payload.dryRun,
    configurationHash: command.payload.configurationHash,
  },
});

export const serializeManageResourcesResult = (
  value: ManageResourcesResult,
): JsonObject => ({
  mode: value.mode,
  status: value.status,
  configurationHash: value.configurationHash,
  operations: value.operations.map((operation) => ({
    resourceType: operation.resourceType,
    naturalKey: operation.naturalKey,
    outcome: operation.outcome,
    changedFields: [...operation.changedFields],
  })),
  rejections: value.rejections.map((rejection) => ({
    resourceType: rejection.resourceType,
    naturalKey: rejection.naturalKey,
    outcome: rejection.outcome,
    code: rejection.code,
    message: rejection.message,
  })),
  summary: {
    created: value.summary.created,
    updated: value.summary.updated,
    noop: value.summary.noop,
    rejected: value.summary.rejected,
  },
  replayed: value.replayed,
  applied: value.applied,
});

const replayedResult = (
  result: ManageResourcesResult,
): ManageResourcesResult =>
  'replayed' in result ? { ...result, replayed: true } : result;

export const resolveManageResourcesReplay = (
  stored: StoredManageResourcesWorkEvent | null,
  expected: ManageResourcesWorkEventCommand,
): ManageResourcesReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeManageResourcesWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const manageResourcesIdempotency: ManageResourcesIdempotency<StoredManageResourcesWorkEvent> =
  Object.freeze({ resolveReplay: resolveManageResourcesReplay });
