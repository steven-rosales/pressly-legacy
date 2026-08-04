import type { DeadWebhookEvent } from '../../../foundations/language/dead-events/dead-webhook-event.model.ts';

export type ListDeadWebhookEventsQuery = Readonly<{
  source?: string;
  afterEventId?: string;
  limit: number;
}>;

export type DeadWebhookEventsResult = Readonly<{
  items: readonly DeadWebhookEvent[];
  nextEventId: string | null;
  asOf: Date;
}>;
