import { isJsonObject, type JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';

export const findOnlineOrderPlacementWorkEventPayload = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<JsonObject | null> => {
  const [event] = await database
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;
  return isJsonObject(event.payload) ? event.payload : {};
};

export const appendOnlineOrderPlacementWorkEvent = async (
  database: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: Readonly<{
    locationId: string;
    eventType:
      | 'production_order_placement_pending'
      | 'production_order_placement_overtime_required'
      | 'production_order_placement_resolved';
    entityType: 'production_order';
    entityId: string;
    actorId: string;
    expectedVersion: number | null;
    idempotencyKey: string;
    payload: JsonObject;
  }>,
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
    payload: event.payload,
  });
};
