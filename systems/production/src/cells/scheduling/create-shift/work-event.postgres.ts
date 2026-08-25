import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { createShiftContract } from './contract.ts';
import type { CreateShiftWorkEventInput } from './execute.ts';
import {
  serializeCreateShiftWorkEventCommand,
  type StoredCreateShiftWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findCreateShiftWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredCreateShiftWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(createShiftContract.output, event.payload);
};

export const appendCreateShiftWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: CreateShiftWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    startsAt: event.payload.startsAt,
    endsAt: event.payload.endsAt,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeCreateShiftWorkEventCommand(event.idempotency.command),
      result: {
        id: event.idempotency.result.id,
        locationId: event.idempotency.result.locationId,
        startsAt: event.idempotency.result.startsAt,
        endsAt: event.idempotency.result.endsAt,
        timezone: event.idempotency.result.timezone,
        effectiveFolderCount: event.idempotency.result.effectiveFolderCount,
        status: event.idempotency.result.status,
        version: event.idempotency.result.version,
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
    expectedVersion: null,
    idempotencyKey: event.idempotencyKey,
    payload,
  });
};
