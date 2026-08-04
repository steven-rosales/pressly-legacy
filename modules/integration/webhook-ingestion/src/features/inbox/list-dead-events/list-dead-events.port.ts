import type { Ok } from '@pressly/kernel';
import type {
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
} from './list-dead-events.model.ts';

export type ListDeadWebhookEvents = (
  query: ListDeadWebhookEventsQuery,
) => Promise<Ok<DeadWebhookEventsResult>>;
