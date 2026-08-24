import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { commitOrderBacklogContract } from './contract.ts';
import type { CommitOrderBacklogWorkEvent } from './execute.ts';
import {
  serializeCommitOrderBacklogBulkCommand,
  serializeCommitOrderBacklogOrderCommand,
  type StoredCommitOrderBacklogWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findCommitOrderBacklogWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredCommitOrderBacklogWorkEvent | null> => {
  const [event] = await database
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;
  return decodeStoredCellWorkEvent(
    commitOrderBacklogContract.output,
    event.payload,
  );
};

const orderPayload = (
  event: Extract<
    CommitOrderBacklogWorkEvent,
    { eventType: 'production_order_bulk_resolved_without_production' }
  >,
): JsonObject => ({
  bulkOperationId: event.payload.bulkOperationId,
  previewHash: event.payload.previewHash,
  from: event.payload.from,
  resolutionState: event.payload.resolutionState,
  reason: event.payload.reason,
  version: event.payload.version,
  [idempotencyEnvelopeKey]: {
    version: 1,
    command: serializeCommitOrderBacklogOrderCommand(event.idempotency.command),
    result: {
      bulkOperationId: event.idempotency.result.bulkOperationId,
      orderId: event.idempotency.result.orderId,
      resolutionState: event.idempotency.result.resolutionState,
      version: event.idempotency.result.version,
    },
  },
});

const receiptPayload = (
  event: Extract<
    CommitOrderBacklogWorkEvent,
    { eventType: 'production_order_backlog_bulk_resolution_committed' }
  >,
): JsonObject => ({
  bulkOperationId: event.payload.bulkOperationId,
  previewHash: event.payload.previewHash,
  reason: event.payload.reason,
  cursor: event.payload.cursor,
  nextCursor: event.payload.nextCursor,
  candidateCount: event.payload.candidateCount,
  resolvedCount: event.payload.resolvedCount,
  [idempotencyEnvelopeKey]: {
    version: 1,
    command: serializeCommitOrderBacklogBulkCommand(event.idempotency.command),
    result: {
      locationId: event.idempotency.result.locationId,
      bulkOperationId: event.idempotency.result.bulkOperationId,
      previewHash: event.idempotency.result.previewHash,
      nextCursor: event.idempotency.result.nextCursor,
      resolvedCount: event.idempotency.result.resolvedCount,
      resolved: event.idempotency.result.resolved.map((order) => ({
        orderId: order.orderId,
        resolutionState: order.resolutionState,
        version: order.version,
      })),
      committedAt: event.idempotency.result.committedAt,
      replayed: event.idempotency.result.replayed,
    },
  },
});

export const appendCommitOrderBacklogWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: CommitOrderBacklogWorkEvent,
): Promise<void> => {
  await database.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: event.expectedVersion,
    idempotencyKey: event.idempotencyKey,
    payload:
      event.eventType === 'production_order_bulk_resolved_without_production'
        ? orderPayload(event)
        : receiptPayload(event),
  });
};
