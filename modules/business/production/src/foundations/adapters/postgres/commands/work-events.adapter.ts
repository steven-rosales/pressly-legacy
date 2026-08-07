import { type DatabaseExecutor } from '@pressly/db/client';
import { eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import { isJsonObject, type JsonObject } from '@pressly/codec';
import type { IdSource } from '@pressly/kernel';
import type {
  StoredWorkEvent,
  WorkEventInput,
} from '../../../language/commands/production-command.model.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findWorkEvent = async (
  db: DatabaseExecutor,
  idempotencyKey: string,
): Promise<StoredWorkEvent | null> => {
  const [event] = await db
    .select({ payload: laundryProduction.workEvents.payload })
    .from(laundryProduction.workEvents)
    .where(eq(laundryProduction.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  const payload = isJsonObject(event.payload) ? event.payload : {};
  const envelope = payload[idempotencyEnvelopeKey];
  if (!isJsonObject(envelope) || envelope['version'] !== 1)
    return { command: {}, result: {}, valid: false };

  const command = envelope['command'];
  const result = envelope['result'];
  const valid = isJsonObject(command) && isJsonObject(result);

  return {
    command: valid ? command : {},
    result: valid ? result : {},
    valid,
  };
};

export const appendWorkEvent = async (
  db: DatabaseExecutor,
  ids: IdSource,
  event: WorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    ...(event.payload ?? {}),
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: event.idempotency.command,
      result: event.idempotency.result,
    },
  };

  await db.insert(laundryProduction.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: event.expectedVersion ?? null,
    idempotencyKey: event.idempotencyKey,
    payload,
  });
};
