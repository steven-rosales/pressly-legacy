import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import {
  databaseError,
  invariantViolationError,
} from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import { canonicalSha256 } from '@pressly/codec/node';
import type { JsonValue } from '@pressly/codec';
import type { Clock } from '@pressly/time';
import type {
  IngestWebhookEvent,
  IngestWebhookEventRepository,
} from './ingest-event.port.ts';

const webhookIngestionFailed = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_event_ingestion_failed',
      message: 'The webhook event could not be stored durably.',
      safeMessage: 'The webhook event could not be stored durably.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const hashWebhookPayload = (payload: JsonValue): string | null => {
  if (payload === null) return null;

  try {
    return canonicalSha256(payload);
  } catch (error) {
    throw mapUnknownError(error, (unknownCause) =>
      invariantViolationError({
        code: 'webhook_payload_hash_failed',
        message: 'The normalized webhook payload could not be hashed.',
        safeMessage: 'The normalized webhook payload is inconsistent.',
        cause: unknownCause,
      }),
    );
  }
};

export const makeIngestWebhookEvent =
  (deps: {
    repo: IngestWebhookEventRepository;
    clock: Clock;
  }): IngestWebhookEvent =>
  async (command) => {
    const payloadHash = hashWebhookPayload(command.payload);
    try {
      const ingested = await deps.repo.ingest({
        command,
        payloadHash,
        now: deps.clock.now(),
      });
      return result.ok({
        eventId: ingested.eventId,
        duplicate: ingested.duplicate,
        status: command.disposition === 'ignore' ? 'ignored' : 'pending',
      });
    } catch (error) {
      throw webhookIngestionFailed(error);
    }
  };
