import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { reconcileBatchProgressContract } from './contract.ts';
import type { ReconcileBatchProgressWorkEventInput } from './execute.ts';
import {
  serializeReconcileBatchProgressWorkEventCommand,
  type StoredReconcileBatchProgressWorkEvent,
} from './idempotency.ts';

const envelopeKey = '_idempotency';

export const findReconcileBatchProgressWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  key: string,
): Promise<StoredReconcileBatchProgressWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, key))
    .limit(1);
  if (event === undefined) return null;
  const decoded = decodeStoredCellWorkEvent(
    reconcileBatchProgressContract.output,
    event.payload,
  );
  return decoded.valid && decoded.result.status === 'reconciled'
    ? { command: decoded.command, result: decoded.result, valid: true }
    : { command: {}, result: {}, valid: false };
};

export const appendReconcileBatchProgressWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: ReconcileBatchProgressWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    ...event.payload,
    [envelopeKey]: {
      version: 1,
      command: serializeReconcileBatchProgressWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        ...event.idempotency.result,
        stageVersions: event.idempotency.result.stageVersions.map((stage) => ({
          ...stage,
        })),
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
