import { decodeBase64UrlText, encodeBase64UrlText } from '@pressly/codec';
import type {
  DeadWebhookEventsQuery,
  DeadWebhookEventsResult as DeadWebhookEventsWireResult,
  ReplayDeadWebhookEventResult as ReplayDeadWebhookEventWireResult,
} from '@pressly/contracts/webhook-ingestion';
import { type AppError } from '@pressly/errors/app-error';
import {
  conflictError,
  invariantViolationError,
  notFoundError,
  validationError,
} from '@pressly/errors/factories';
import type {
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
  ReplayDeadWebhookEventResult,
  ReplayDeadWebhookEventFailure,
} from '@pressly/webhook-ingestion';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const decodeDeadWebhookEventCursor = (cursor: string): string => {
  const decoded = decodeBase64UrlText(cursor);
  if (decoded === null || !uuidPattern.test(decoded))
    throw validationError({
      code: 'dead_webhook_event_cursor_invalid',
      message: 'The dead-event cursor is invalid.',
      safeMessage: 'The dead-event cursor is invalid.',
    });
  return decoded;
};

const encodeDeadWebhookEventCursor = (eventId: string): string => {
  if (!uuidPattern.test(eventId))
    throw invariantViolationError({
      code: 'dead_webhook_event_id_invalid',
      message: 'A stored dead webhook event ID is not a UUID.',
      safeMessage: 'Stored webhook data is inconsistent.',
    });
  return encodeBase64UrlText(eventId);
};

export const toListDeadWebhookEventsQuery = (
  query: DeadWebhookEventsQuery,
): ListDeadWebhookEventsQuery => ({
  ...(query.source === undefined ? {} : { source: query.source }),
  ...(query.cursor === undefined
    ? {}
    : { afterEventId: decodeDeadWebhookEventCursor(query.cursor) }),
  limit: query.limit,
});

export const toDeadWebhookEventsResult = (
  result: DeadWebhookEventsResult,
): DeadWebhookEventsWireResult => ({
  items: result.items.map((event) => ({
    eventId: event.eventId,
    source: event.source,
    eventType: event.eventType,
    subjectType: event.subjectType,
    subjectId: event.subjectId,
    sourceLocationId: event.sourceLocationId,
    sourceOccurredAt: event.sourceOccurredAt?.toISOString() ?? null,
    attempts: event.attempts,
    lastErrorCode: event.lastErrorCode,
    receivedAt: event.receivedAt.toISOString(),
  })),
  nextCursor:
    result.nextEventId === null
      ? null
      : encodeDeadWebhookEventCursor(result.nextEventId),
  asOf: result.asOf.toISOString(),
});

export const toReplayDeadWebhookEventResult = (
  result: ReplayDeadWebhookEventResult,
): ReplayDeadWebhookEventWireResult => ({
  eventId: result.eventId,
  outcome: result.outcome,
});

export const toReplayDeadWebhookEventError = (
  failure: ReplayDeadWebhookEventFailure,
): AppError =>
  failure.code === 'webhook_event_not_found'
    ? notFoundError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      })
    : conflictError({
        code: failure.code,
        message: failure.message,
        safeMessage: failure.message,
      });
