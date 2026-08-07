import type { Ok } from '@pressly/kernel';
import type {
  DeadWebhookEventsResult,
  DeadWebhookEvent,
  ListDeadWebhookEventsQuery,
} from './list-dead-events.model.ts';

export type ListDeadWebhookEvents = (
  query: ListDeadWebhookEventsQuery,
) => Promise<Ok<DeadWebhookEventsResult>>;

export type ListDeadWebhookEventsRepository = (input: {
  source?: string;
  afterEventId?: string;
  limit: number;
}) => Promise<readonly DeadWebhookEvent[]>;
