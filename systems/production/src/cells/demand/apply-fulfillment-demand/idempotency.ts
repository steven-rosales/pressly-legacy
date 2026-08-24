import { canonicalJson, type JsonObject } from '@pressly/codec';
import type { StoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import type {
  ApplyFulfillmentDemandIdempotency,
  ApplyFulfillmentDemandReplay,
  ApplyFulfillmentDemandWorkEventCommand,
} from './execute.ts';
import type { ApplyFulfillmentDemandResult } from './types.ts';

export type StoredApplyFulfillmentDemandWorkEvent =
  StoredCellWorkEvent<ApplyFulfillmentDemandResult>;

export const serializeApplyFulfillmentDemandWorkEventCommand = (
  command: ApplyFulfillmentDemandWorkEventCommand,
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
    fulfillmentId: command.payload.fulfillmentId,
    fulfillmentVersion: command.payload.fulfillmentVersion,
    projectionHash: command.payload.projectionHash,
    displayReference: command.payload.displayReference,
    admissionState: command.payload.admissionState,
    commercialState: command.payload.commercialState,
    dueAt: command.payload.dueAt,
    observedAt: command.payload.observedAt,
    estimatedWeightLbs: command.payload.estimatedWeightLbs,
    estimatedWeightSource: command.payload.estimatedWeightSource,
  },
});

const replayedResult = (
  result: ApplyFulfillmentDemandResult,
): ApplyFulfillmentDemandResult =>
  'replayed' in result ? { ...result, replayed: true } : result;

export const resolveApplyFulfillmentDemandReplay = (
  stored: StoredApplyFulfillmentDemandWorkEvent | null,
  expected: ApplyFulfillmentDemandWorkEventCommand,
): ApplyFulfillmentDemandReplay => {
  if (stored === null) return { kind: 'miss' };
  if (
    !stored.valid ||
    canonicalJson(stored.command) !==
      canonicalJson(serializeApplyFulfillmentDemandWorkEventCommand(expected))
  )
    return { kind: 'conflict' };
  return { kind: 'replay', result: replayedResult(stored.result) };
};

export const applyFulfillmentDemandIdempotency = Object.freeze({
  resolveReplay: resolveApplyFulfillmentDemandReplay,
}) satisfies ApplyFulfillmentDemandIdempotency<StoredApplyFulfillmentDemandWorkEvent>;
