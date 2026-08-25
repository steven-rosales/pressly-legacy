import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { recordOrderIntakeContract } from './contract.ts';
import type { RecordOrderIntakeWorkEventInput } from './execute.ts';
import {
  serializeRecordOrderIntakeWorkEventCommand,
  type StoredRecordOrderIntakeWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findRecordOrderIntakeWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredRecordOrderIntakeWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    recordOrderIntakeContract.output,
    event.payload,
  );
};

export const appendRecordOrderIntakeWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: RecordOrderIntakeWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    bagCount: event.payload.bagCount,
    bagCountProvenance: event.payload.bagCountProvenance,
    intakeVersion: event.payload.intakeVersion,
    version: event.payload.version,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeRecordOrderIntakeWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        locationId: event.idempotency.result.locationId,
        orderId: event.idempotency.result.orderId,
        bagCount: event.idempotency.result.bagCount,
        bagCountProvenance: event.idempotency.result.bagCountProvenance,
        intakeVersion: event.idempotency.result.intakeVersion,
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
