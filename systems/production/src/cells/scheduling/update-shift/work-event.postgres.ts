import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { updateShiftContract } from './contract.ts';
import type { UpdateShiftWorkEventInput } from './execute.ts';
import {
  serializeUpdateShiftWorkEventCommand,
  type StoredUpdateShiftWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findUpdateShiftWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredUpdateShiftWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(updateShiftContract.output, event.payload);
};

const serializedResult = (
  result: UpdateShiftWorkEventInput['idempotency']['result'],
): JsonObject => ({
  productionShift: {
    id: result.productionShift.id,
    locationId: result.productionShift.locationId,
    startsAt: result.productionShift.startsAt,
    endsAt: result.productionShift.endsAt,
    timezone: result.productionShift.timezone,
    effectiveFolderCount: result.productionShift.effectiveFolderCount,
    status: result.productionShift.status,
    version: result.productionShift.version,
  },
  supersededScheduleRunId: result.supersededScheduleRunId,
  replayed: result.replayed,
});

export const appendUpdateShiftWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: UpdateShiftWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    changedFields: [...event.payload.changedFields],
    previous: { ...event.payload.previous },
    current: { ...event.payload.current },
    supersededScheduleRunId: event.payload.supersededScheduleRunId,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeUpdateShiftWorkEventCommand(event.idempotency.command),
      result: serializedResult(event.idempotency.result),
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
