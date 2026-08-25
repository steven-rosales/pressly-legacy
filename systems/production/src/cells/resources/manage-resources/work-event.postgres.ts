import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { manageResourcesContract } from './contract.ts';
import type { ManageResourcesWorkEventCommand } from './execute.ts';
import {
  serializeManageResourcesResult,
  serializeManageResourcesWorkEventCommand,
  type StoredManageResourcesWorkEvent,
} from './idempotency.ts';
import type { ManageResourcesResult } from './types.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findManageResourcesWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredManageResourcesWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;
  return decodeStoredCellWorkEvent(
    manageResourcesContract.output,
    event.payload,
  );
};

export const appendManageResourcesWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  input: Readonly<{
    locationId: string;
    entityId: string;
    actorId: string;
    idempotencyKey: string;
    result: ManageResourcesResult;
    idempotency: ManageResourcesWorkEventCommand;
  }>,
): Promise<void> => {
  const serializedResult = serializeManageResourcesResult(input.result);
  const payload: JsonObject = {
    result: serializedResult,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeManageResourcesWorkEventCommand(input.idempotency),
      result: serializedResult,
    },
  };
  await db.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: input.locationId,
    eventType: 'production_resources_bootstrapped',
    entityType: 'production_resource_manifest',
    entityId: input.entityId,
    actorId: input.actorId,
    expectedVersion: null,
    idempotencyKey: input.idempotencyKey,
    payload,
  });
};
