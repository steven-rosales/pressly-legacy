import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
} from '../../../model/inbox.ts';
import type {
  ListDeadEventsClock,
  ListDeadEventsExpectedFailure,
  ListDeadEventsRepository,
} from './types.ts';

export type ListDeadEventsDependencies = Readonly<{
  repo: ListDeadEventsRepository;
  clock: ListDeadEventsClock;
}>;

export const makeExecuteListDeadEvents =
  (deps: ListDeadEventsDependencies) =>
  async (
    query: ListDeadWebhookEventsQuery,
  ): Promise<
    CellOutcome<DeadWebhookEventsResult, ListDeadEventsExpectedFailure>
  > => {
    try {
      const rows = await deps.repo.list({
        ...(query.source === undefined ? {} : { source: query.source }),
        ...(query.afterEventId === undefined
          ? {}
          : { afterEventId: query.afterEventId }),
        limit: query.limit + 1,
      });
      const items = rows.slice(0, query.limit);
      const last = items.at(-1);
      return {
        kind: 'success',
        value: {
          items: Object.freeze([...items]),
          nextEventId:
            rows.length > query.limit && last !== undefined
              ? last.eventId
              : null,
          asOf: deps.clock.now(),
        },
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'dead_webhook_event_list_failed',
          message: 'Dead webhook events could not be listed.',
          safeMessage: 'Dead webhook events could not be listed.',
          status: 503,
          cause,
        }),
      );
    }
  };
