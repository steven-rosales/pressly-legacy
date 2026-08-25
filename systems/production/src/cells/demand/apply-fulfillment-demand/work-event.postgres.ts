import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { applyFulfillmentDemandContract } from './contract.ts';
import type { ApplyFulfillmentDemandWorkEventInput } from './execute.ts';
import {
  serializeApplyFulfillmentDemandWorkEventCommand,
  type StoredApplyFulfillmentDemandWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findApplyFulfillmentDemandWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredApplyFulfillmentDemandWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    applyFulfillmentDemandContract.output,
    event.payload,
  );
};

export const appendApplyFulfillmentDemandWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: ApplyFulfillmentDemandWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    outcome: event.payload.outcome,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeApplyFulfillmentDemandWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        orderDemandId: event.idempotency.result.orderDemandId,
        productionOrderId: event.idempotency.result.productionOrderId,
        outcome: event.idempotency.result.outcome,
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
    expectedVersion: null,
    idempotencyKey: event.idempotencyKey,
    payload,
  });
};
