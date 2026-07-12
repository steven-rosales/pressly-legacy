import type {
  IngestWebhookEventCommand,
  IngestWebhookEventResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type IngestWebhookEvent = (
  command: IngestWebhookEventCommand,
) => Promise<Result<IngestWebhookEventResult, AppError>>;

export type IngestWebhookEventRepository = Readonly<{
  ingest: (input: {
    command: IngestWebhookEventCommand;
    payloadHash: string | null;
    now: Date;
  }) => Promise<Readonly<{ eventId: string; duplicate: boolean }>>;
}>;
