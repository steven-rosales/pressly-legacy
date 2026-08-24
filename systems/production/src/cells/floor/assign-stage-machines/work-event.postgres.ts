import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { assignStageMachinesContract } from './contract.ts';
import type { AssignStageMachinesWorkEventInput } from './execute.ts';
import {
  serializeAssignStageMachinesWorkEventCommand,
  type StoredAssignStageMachinesWorkEvent,
} from './idempotency.ts';

const envelopeKey = '_idempotency';

export const findAssignStageMachinesWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredAssignStageMachinesWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;
  return decodeStoredCellWorkEvent(
    assignStageMachinesContract.output,
    event.payload,
  );
};

export const appendAssignStageMachinesWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: AssignStageMachinesWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    machineIds: [...event.payload.machineIds],
    version: event.payload.version,
    [envelopeKey]: {
      version: 1,
      command: serializeAssignStageMachinesWorkEventCommand(
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
