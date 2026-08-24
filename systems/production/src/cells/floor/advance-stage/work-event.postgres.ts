import type { JsonObject } from '@pressly/codec';
import type { PostgresExecutor } from '@pressly/postgres/client';
import { eq } from '@pressly/postgres/query';
import type { ProductionSchema } from '../../../schema/production-schema.ts';
import type { IdSource } from '@pressly/cells/id-source';
import { decodeStoredCellWorkEvent } from '../../../postgres/stored-cell-work-event.postgres.ts';
import { advanceStageContract } from './contract.ts';
import type { AdvanceStageWorkEventInput } from './execute.ts';
import {
  serializeAdvanceStageWorkEventCommand,
  type StoredAdvanceStageWorkEvent,
} from './idempotency.ts';

const idempotencyEnvelopeKey = '_idempotency';

export const findAdvanceStageWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  idempotencyKey: string,
): Promise<StoredAdvanceStageWorkEvent | null> => {
  const [event] = await db
    .select({ payload: schema.workEvents.payload })
    .from(schema.workEvents)
    .where(eq(schema.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  return decodeStoredCellWorkEvent(advanceStageContract.output, event.payload);
};

const earlyStartJson = (
  value: NonNullable<AdvanceStageWorkEventInput['payload']['earlyStart']>,
): JsonObject => ({
  actorId: value.actorId,
  confirmationHash: value.confirmationHash,
  confirmationObservedAt: value.confirmationObservedAt,
  confirmedAt: value.confirmedAt,
  plannedStartAt: value.plannedStartAt,
  plannedEndAt: value.plannedEndAt,
  remainingMilliseconds: value.remainingMilliseconds,
});

const earlyCompletionJson = (
  value: NonNullable<AdvanceStageWorkEventInput['payload']['earlyCompletion']>,
): JsonObject => ({
  actorId: value.actorId,
  confirmationHash: value.confirmationHash,
  confirmationObservedAt: value.confirmationObservedAt,
  confirmedAt: value.confirmedAt,
  actualStartAt: value.actualStartAt,
  plannedEndAt: value.plannedEndAt,
  completionBoundaryAt: value.completionBoundaryAt,
  plannedDurationMilliseconds: value.plannedDurationMilliseconds,
  elapsedMilliseconds: value.elapsedMilliseconds,
  remainingMilliseconds: value.remainingMilliseconds,
});

const workEventPayload = (event: AdvanceStageWorkEventInput): JsonObject => ({
  version: event.payload.version,
  ...(event.payload.earlyStart === undefined
    ? {}
    : { earlyStart: earlyStartJson(event.payload.earlyStart) }),
  ...(event.payload.earlyCompletion === undefined
    ? {}
    : { earlyCompletion: earlyCompletionJson(event.payload.earlyCompletion) }),
  [idempotencyEnvelopeKey]: {
    version: 1,
    command: serializeAdvanceStageWorkEventCommand(event.idempotency.command),
    result: {
      entityId: event.idempotency.result.entityId,
      version: event.idempotency.result.version,
      replayed: event.idempotency.result.replayed,
    },
  },
});

export const appendAdvanceStageWorkEvent = async (
  db: PostgresExecutor,
  schema: ProductionSchema,
  ids: IdSource,
  event: AdvanceStageWorkEventInput,
): Promise<void> => {
  await db.insert(schema.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: event.expectedVersion,
    idempotencyKey: event.idempotencyKey,
    payload: workEventPayload(event),
  });
};
