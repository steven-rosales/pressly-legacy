import { eq, laundryProduction, type DatabaseExecutor } from '@pressly/db';
import type {
  IdPort,
  StoredWorkEvent,
  WorkEventInput,
} from '../production.port.ts';

const idempotencyEnvelopeKey = '_idempotency';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const findWorkEvent = async (
  db: DatabaseExecutor,
  idempotencyKey: string,
): Promise<StoredWorkEvent | null> => {
  const [event] = await db
    .select({ payload: laundryProduction.workEvents.payload })
    .from(laundryProduction.workEvents)
    .where(eq(laundryProduction.workEvents.idempotencyKey, idempotencyKey))
    .limit(1);
  if (event === undefined) return null;

  const payload = isRecord(event.payload) ? event.payload : {};
  const envelope = payload[idempotencyEnvelopeKey];
  if (!isRecord(envelope) || envelope['version'] !== 1)
    return { command: null, result: null, valid: false };

  return {
    command: envelope['command'],
    result: envelope['result'],
    valid: 'command' in envelope && 'result' in envelope,
  };
};

export const appendWorkEvent = async (
  db: DatabaseExecutor,
  ids: IdPort,
  event: WorkEventInput,
): Promise<void> => {
  await db.insert(laundryProduction.workEvents).values({
    id: ids.next(),
    locationId: event.locationId,
    eventType: event.eventType,
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    expectedVersion: event.expectedVersion ?? null,
    idempotencyKey: event.idempotencyKey,
    payload: {
      ...(event.payload ?? {}),
      [idempotencyEnvelopeKey]: {
        version: 1,
        command: event.idempotency.command,
        result: event.idempotency.result,
      },
    },
  });
};
