import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { changeOrderResolutionContract } from './contract.ts';
import type { ChangeOrderResolutionWorkEventInput } from './execute.ts';
import {
  serializeChangeOrderResolutionWorkEventCommand,
  type StoredChangeOrderResolutionWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findChangeOrderResolutionWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredChangeOrderResolutionWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;
  return decodeStoredCellWorkEvent(
    changeOrderResolutionContract.output,
    event.payload,
  );
};

export const appendChangeOrderResolutionWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: ChangeOrderResolutionWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    action: event.payload.action,
    from: event.payload.from,
    resolutionState: event.payload.resolutionState,
    reason: event.payload.reason,
    note: event.payload.note,
    reviewReasons: [...event.payload.reviewReasons],
    clearedPendingPlacement: event.payload.clearedPendingPlacement,
    ...(event.payload.restoredSourceProjection === undefined
      ? {}
      : { restoredSourceProjection: event.payload.restoredSourceProjection }),
    version: event.payload.version,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeChangeOrderResolutionWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        locationId: event.idempotency.result.locationId,
        orderId: event.idempotency.result.orderId,
        action: event.idempotency.result.action,
        resolutionState: event.idempotency.result.resolutionState,
        transitionedAt: event.idempotency.result.transitionedAt,
        version: event.idempotency.result.version,
        replayed: event.idempotency.result.replayed,
      },
    },
  };
  await db.insert(schema.workEvents).values({
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
