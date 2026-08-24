import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { replaceShiftSelectionContract } from './contract.ts';
import type { ReplaceShiftSelectionWorkEventInput } from './execute.ts';
import {
  serializeReplaceShiftSelectionWorkEventCommand,
  type StoredReplaceShiftSelectionWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findReplaceShiftSelectionWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredReplaceShiftSelectionWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    replaceShiftSelectionContract.output,
    event.payload,
  );
};

export const appendReplaceShiftSelectionWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: ReplaceShiftSelectionWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    selectedOrderIds: [...event.payload.selectedOrderIds],
    version: event.payload.version,
    supersededScheduleRunId: event.payload.supersededScheduleRunId,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeReplaceShiftSelectionWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        selection: {
          productionShiftId:
            event.idempotency.result.selection.productionShiftId,
          version: event.idempotency.result.selection.version,
          selectedOrderIds: [
            ...event.idempotency.result.selection.selectedOrderIds,
          ],
        },
        supersededScheduleRunId:
          event.idempotency.result.supersededScheduleRunId,
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
