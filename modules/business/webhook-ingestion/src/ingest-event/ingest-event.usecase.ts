import { databaseError, mapUnknownError, type AppError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import { canonicalSha256 } from '@pressly/kernel/node';
import type { WebhookIngestionClockPort } from '../ingestion/webhook-ingestion.port.ts';
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

export const hashWebhookPayload = (payload: unknown): string | null =>
  payload === null ? null : canonicalSha256(payload);

export const makeIngestWebhookEvent =
  (deps: {
    repo: IngestWebhookEventRepository;
    clock: WebhookIngestionClockPort;
  }): IngestWebhookEvent =>
  async (command) => {
    try {
      const ingested = await deps.repo.ingest({
        command,
        payloadHash: hashWebhookPayload(command.payload),
        now: deps.clock.now(),
      });
      return result.ok({
        eventId: ingested.eventId,
        duplicate: ingested.duplicate,
        status: command.disposition === 'ignore' ? 'ignored' : 'pending',
      });
    } catch (error) {
      return result.err(webhookIngestionFailed(error));
    }
  };
