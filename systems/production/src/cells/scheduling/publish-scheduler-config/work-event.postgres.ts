import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { publishSchedulerConfigContract } from './contract.ts';
import type { PublishSchedulerConfigWorkEventInput } from './execute.ts';
import {
  serializePublishSchedulerConfigWorkEventCommand,
  type StoredPublishSchedulerConfigWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findPublishSchedulerConfigWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredPublishSchedulerConfigWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    publishSchedulerConfigContract.output,
    event.payload,
  );
};

export const appendPublishSchedulerConfigWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: PublishSchedulerConfigWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    version: event.payload.version,
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializePublishSchedulerConfigWorkEventCommand(
        event.idempotency.command,
      ),
      result: {
        id: event.idempotency.result.id,
        pulseMinutes: event.idempotency.result.pulseMinutes,
        foldLbsPerFolderMinute: event.idempotency.result.foldLbsPerFolderMinute,
        algorithmVersion: event.idempotency.result.algorithmVersion,
        version: event.idempotency.result.version,
        stageFitAssertion: {
          sortingFits: event.idempotency.result.stageFitAssertion.sortingFits,
          washingFits: event.idempotency.result.stageFitAssertion.washingFits,
          dryingFits: event.idempotency.result.stageFitAssertion.dryingFits,
          assertedBy: event.idempotency.result.stageFitAssertion.assertedBy,
          assertedAt: event.idempotency.result.stageFitAssertion.assertedAt,
        },
        publishedAt: event.idempotency.result.publishedAt,
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
