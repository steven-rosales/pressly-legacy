import type { IngestWebhookEventCommand } from '../../../model/inbox.ts';

export const ingestEventOperationId = 'ingress.ingest-event.v1' as const;

export type IngestEventExpectedFailure = never;

export type IngestEventRepository = Readonly<{
  ingest: (input: {
    command: IngestWebhookEventCommand;
    payloadHash: string | null;
    now: Date;
  }) => Promise<Readonly<{ eventId: string; duplicate: boolean }>>;
}>;

export type IngestEventClock = Readonly<{ now: () => Date }>;
export type IngestEventIdSource = Readonly<{ next: () => string }>;
