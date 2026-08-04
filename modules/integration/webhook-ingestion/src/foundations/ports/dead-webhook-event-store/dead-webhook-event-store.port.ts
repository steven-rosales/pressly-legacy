import type { DeadWebhookEvent } from '../../language/dead-events/dead-webhook-event.model.ts';

export type DeadWebhookEventStore = Readonly<{
  list: (input: {
    source?: string;
    afterEventId?: string;
    limit: number;
  }) => Promise<readonly DeadWebhookEvent[]>;
  replay: (
    eventId: string,
    now: Date,
  ) => Promise<'queued' | 'already_queued' | 'not_found' | 'not_replayable'>;
}>;
