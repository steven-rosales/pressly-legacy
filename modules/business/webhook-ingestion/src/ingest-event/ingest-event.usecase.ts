import { createHash } from 'node:crypto';
import { result } from '@pressly/kernel';
import { webhookIngestionError } from '../ingestion/webhook-ingestion.error.ts';
import type { WebhookIngestionClockPort } from '../ingestion/webhook-ingestion.port.ts';
import type {
  IngestWebhookEvent,
  IngestWebhookEventRepository,
} from './ingest-event.port.ts';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
};

export const hashWebhookPayload = (payload: unknown): string | null =>
  payload === null
    ? null
    : createHash('sha256')
        .update(JSON.stringify(canonicalize(payload)))
        .digest('hex');

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
      return result.err(
        webhookIngestionError(
          'WEBHOOK_EVENT_INGESTION_FAILED',
          'The webhook event could not be stored durably.',
          503,
          error,
        ),
      );
    }
  };
