import type { Ok } from '@pressly/kernel';
import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from './ingest-event.model.ts';

export type IngestWebhookEvent = (
  command: IngestWebhookEventCommand,
) => Promise<Ok<IngestWebhookEventResult>>;

export type IngestWebhookEventRepository = Readonly<{
  ingest: (input: {
    command: IngestWebhookEventCommand;
    payloadHash: string | null;
    now: Date;
  }) => Promise<Readonly<{ eventId: string; duplicate: boolean }>>;
}>;
