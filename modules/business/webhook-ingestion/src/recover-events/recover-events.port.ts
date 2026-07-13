import type {
  DeadWebhookEvent,
  DeadWebhookEventsQuery,
  DeadWebhookEventsResult,
  ReplayDeadWebhookEventResult,
} from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type ListDeadWebhookEvents = (
  query: DeadWebhookEventsQuery,
) => Promise<Result<DeadWebhookEventsResult, AppError>>;

export type ReplayDeadWebhookEvent = (command: {
  eventId: string;
  confirmation: 'replay-dead-webhook-event';
}) => Promise<Result<ReplayDeadWebhookEventResult, AppError>>;

export type RecoverWebhookEventsRepository = Readonly<{
  listDead: (input: {
    source?: string;
    afterEventId?: string;
    limit: number;
  }) => Promise<readonly DeadWebhookEvent[]>;
  replay: (
    eventId: string,
    now: Date,
  ) => Promise<'queued' | 'already_queued' | 'not_found' | 'not_replayable'>;
}>;
