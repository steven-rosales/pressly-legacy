import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { freezeBatchMembershipContract } from './contract.ts';
import type { FreezeBatchMembershipWorkEventInput } from './execute.ts';
import {
  serializeFreezeBatchMembershipWorkEventCommand,
  type StoredFreezeBatchMembershipWorkEvent,
} from './idempotency.ts';

const envelopeKey = '_idempotency';

export const findFreezeBatchMembershipWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  key: string,
): Promise<StoredFreezeBatchMembershipWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, key))
    .limit(1);
  if (event === undefined) return null;
  return decodeStoredCellWorkEvent(
    freezeBatchMembershipContract.output,
    event.payload,
  );
};

export const appendFreezeBatchMembershipWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: FreezeBatchMembershipWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    ...event.payload,
    [envelopeKey]: {
      version: 1,
      command: serializeFreezeBatchMembershipWorkEventCommand(
        event.idempotency.command,
      ),
      result: { ...event.idempotency.result },
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
