import {
  conflictError,
  invariantViolationError,
  notFoundError,
  validationError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { WebhookIngestionClockPort } from '../ingestion/webhook-ingestion.port.ts';
import type {
  ListDeadWebhookEvents,
  RecoverWebhookEventsRepository,
  ReplayDeadWebhookEvent,
} from './recover-events.port.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const encodeDeadWebhookEventCursor = (eventId: string): string => {
  if (!uuidPattern.test(eventId))
    throw invariantViolationError({
      code: 'dead_webhook_event_id_invalid',
      message: 'A stored dead webhook event ID is not a UUID.',
      safeMessage: 'Stored webhook data is inconsistent.',
    });
  return Buffer.from(eventId, 'utf8').toString('base64url');
};

const decodeCursor = (cursor: string): string | null => {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    return uuidPattern.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
};

export const makeListDeadWebhookEvents =
  (deps: {
    repo: RecoverWebhookEventsRepository;
    clock: WebhookIngestionClockPort;
  }): ListDeadWebhookEvents =>
  async (query) => {
    const afterEventId =
      query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (afterEventId === null)
      return result.err(
        validationError({
          code: 'dead_webhook_event_cursor_invalid',
          message: 'The dead-event cursor is invalid.',
          safeMessage: 'The dead-event cursor is invalid.',
        }),
      );

    const rows = await deps.repo.listDead({
      ...(query.source === undefined ? {} : { source: query.source }),
      ...(afterEventId === undefined ? {} : { afterEventId }),
      limit: query.limit + 1,
    });
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return result.ok({
      items: [...items],
      nextCursor:
        rows.length > query.limit && last !== undefined
          ? encodeDeadWebhookEventCursor(last.eventId)
          : null,
      asOf: deps.clock.now().toISOString(),
    });
  };

export const makeReplayDeadWebhookEvent =
  (deps: {
    repo: RecoverWebhookEventsRepository;
    clock: WebhookIngestionClockPort;
  }): ReplayDeadWebhookEvent =>
  async ({ eventId }) => {
    const replayed = await deps.repo.replay(eventId, deps.clock.now());
    if (replayed === 'not_found')
      return result.err(
        notFoundError({
          code: 'webhook_event_not_found',
          message: 'The webhook event was not found.',
          safeMessage: 'The webhook event was not found.',
        }),
      );
    if (replayed === 'not_replayable')
      return result.err(
        conflictError({
          code: 'webhook_event_not_replayable',
          message:
            'Only a dead or already queued webhook event can be replayed.',
          safeMessage:
            'Only a dead or already queued webhook event can be replayed.',
        }),
      );
    return result.ok({ eventId, outcome: replayed });
  };
