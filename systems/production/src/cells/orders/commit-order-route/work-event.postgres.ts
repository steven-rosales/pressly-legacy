import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { commitOrderRouteContract } from './contract.ts';
import type { CommitOrderRouteWorkEventInput } from './execute.ts';
import {
  serializeCommitOrderRouteWorkEventCommand,
  type StoredCommitOrderRouteWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findCommitOrderRouteWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredCommitOrderRouteWorkEvent | null> => {
  const [event] = await database
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    commitOrderRouteContract.output,
    event.payload,
  );
};

export const appendCommitOrderRouteWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: CommitOrderRouteWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    productionRunId: event.payload.productionRunId,
    sourceProductionBatchId: event.payload.sourceProductionBatchId,
    targetProductionBatchId: event.payload.targetProductionBatchId,
    reason: event.payload.reason,
    restartStage: event.payload.restartStage,
    releasedStages: [...event.payload.releasedStages],
    assignedStages: [...event.payload.assignedStages],
    proposalHash: event.payload.proposalHash,
    queueVersion: event.payload.queueVersion,
    orderVersion: event.payload.orderVersion,
    ...(event.payload.note === undefined ? {} : { note: event.payload.note }),
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeCommitOrderRouteWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        status: event.idempotency.result.status,
        proposal: {
          ...event.idempotency.result.proposal,
          releasedStages: [...event.idempotency.result.proposal.releasedStages],
          assignedStages: [...event.idempotency.result.proposal.assignedStages],
        },
        queueVersion: event.idempotency.result.queueVersion,
        orderVersion: event.idempotency.result.orderVersion,
        sourceBatchVersion: event.idempotency.result.sourceBatchVersion,
        targetBatchVersion: event.idempotency.result.targetBatchVersion,
        createdAttemptIds: [...event.idempotency.result.createdAttemptIds],
        replayed: event.idempotency.result.replayed,
      },
    },
  };

  await database.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: event.expectedVersion,
    idempotencyKey: event.idempotencyKey,
    payload,
  });
};
