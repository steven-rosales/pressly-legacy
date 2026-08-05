import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type {
  ListDeadWebhookEvents,
  ListDeadWebhookEventsRepository,
} from './list-dead-events.port.ts';

const deadEventListFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'dead_webhook_event_list_failed',
      message: 'Dead webhook events could not be listed.',
      safeMessage: 'Dead webhook events could not be listed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeListDeadWebhookEvents =
  (deps: {
    repo: ListDeadWebhookEventsRepository;
    clock: Clock;
  }): ListDeadWebhookEvents =>
  async (query) => {
    let rows: Awaited<ReturnType<ListDeadWebhookEventsRepository>>;
    try {
      rows = await deps.repo({
        ...(query.source === undefined ? {} : { source: query.source }),
        ...(query.afterEventId === undefined
          ? {}
          : { afterEventId: query.afterEventId }),
        limit: query.limit + 1,
      });
    } catch (error) {
      throw deadEventListFailure(error);
    }

    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return result.ok({
      items: [...items],
      nextEventId:
        rows.length > query.limit && last !== undefined ? last.eventId : null,
      asOf: deps.clock.now(),
    });
  };
