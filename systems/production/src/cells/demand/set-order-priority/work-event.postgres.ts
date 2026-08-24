import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { setOrderPriorityContract } from './contract.ts';
import type { SetOrderPriorityWorkEventInput } from './execute.ts';
import {
  serializeSetOrderPriorityWorkEventCommand,
  type StoredSetOrderPriorityWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findSetOrderPriorityWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredSetOrderPriorityWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    setOrderPriorityContract.output,
    event.payload,
  );
};

export const appendSetOrderPriorityWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: SetOrderPriorityWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    priority: event.payload.priority,
    version: event.payload.version,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeSetOrderPriorityWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        entityId: event.idempotency.result.entityId,
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
