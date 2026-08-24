import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { startScheduleContract } from './contract.ts';
import type { StartScheduleWorkEventInput } from './execute.ts';
import {
  serializeStartScheduleResult,
  serializeStartScheduleWorkEventCommand,
  type StoredStartScheduleWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findStartScheduleWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredStartScheduleWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;
  return decodeStoredCellWorkEvent(startScheduleContract.output, event.payload);
};

export const appendStartScheduleWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: StartScheduleWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    scheduleRunId: event.payload.scheduleRunId,
    productionRunId: event.payload.productionRunId,
    productionBatchIds: [...event.payload.productionBatchIds],
    queueVersion: event.payload.queueVersion,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeStartScheduleWorkEventCommand(
        event.idempotency.command,
      ),
      result: serializeStartScheduleResult(event.idempotency.result),
    },
  };
  await db.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: null,
    idempotencyKey: event.idempotencyKey,
    payload,
  });
};
