import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { acceptScheduleContract } from './contract.ts';
import type { AcceptScheduleWorkEventCommand } from './execute.ts';
import {
  serializeAcceptScheduleWorkEventCommand,
  type StoredAcceptScheduleWorkEvent,
} from './idempotency.ts';
import type { AcceptScheduleResult } from './types.ts';

const idempotencyEnvelopeKey = '_idempotency';

export type AppendAcceptScheduleWorkEventInput = Readonly<{
  locationId: string;
  scheduleRunId: string;
  actorId: string;
  idempotencyKey: string;
  acknowledgedWarningCodes: readonly string[];
  idempotency: AcceptScheduleWorkEventCommand;
  result: AcceptScheduleResult;
}>;

export const findAcceptScheduleWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredAcceptScheduleWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(
    acceptScheduleContract.output,
    event.payload,
  );
};

export const appendAcceptScheduleWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: AppendAcceptScheduleWorkEventInput,
): Promise<void> => {
  const payload: JsonObject = {
    scheduleRunId: event.scheduleRunId,
    acknowledgedWarningCodes: [...event.acknowledgedWarningCodes],
    [idempotencyEnvelopeKey]: {
      version: 1,
      command: serializeAcceptScheduleWorkEventCommand(event.idempotency),
      result: {
        scheduleRunId: event.result.scheduleRunId,
        productionShiftId: event.result.productionShiftId,
        acceptedAt: event.result.acceptedAt,
        replayed: event.result.replayed,
      },
    },
  };

  await db.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: 'schedule_accepted',
    entityType: 'schedule_run',
    entityId: event.scheduleRunId,
    actorId: event.actorId,
    expectedVersion: null,
    idempotencyKey: event.idempotencyKey,
    payload,
  });
};
