import {
  decode,
  http,
  type CellOutcome,
  type HttpRequest,
  type HttpResponse,
  type HttpSurface,
} from '@pressly/cells';
import { decodeBase64UrlText, encodeBase64UrlText } from '@pressly/codec';
import {
  invariantViolationError,
  validationError,
} from '@pressly/errors/factories';
import { deadWebhookEventsQuerySchema } from '../../../contracts/webhook-ingestion-v1.ts';
import type {
  DeadWebhookEventsResult,
  ListDeadWebhookEventsQuery,
} from '../../../model/inbox.ts';
import type { ListDeadEventsExpectedFailure } from './types.ts';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cursorEventId = (cursor: string): string => {
  const decoded = decodeBase64UrlText(cursor);
  if (decoded !== null && uuidPattern.test(decoded)) return decoded;
  throw validationError({
    code: 'dead_webhook_event_cursor_invalid',
    message: 'The dead-event cursor is invalid.',
    safeMessage: 'The dead-event cursor is invalid.',
  });
};

const queryFrom = (request: HttpRequest): ListDeadWebhookEventsQuery => {
  const parsed = deadWebhookEventsQuerySchema.parse(request.query);
  return {
    ...(parsed.source === undefined ? {} : { source: parsed.source }),
    ...(parsed.cursor === undefined
      ? {}
      : { afterEventId: cursorEventId(parsed.cursor) }),
    limit: parsed.limit,
  };
};

const present = (
  outcome: CellOutcome<DeadWebhookEventsResult, ListDeadEventsExpectedFailure>,
): HttpResponse => {
  if (outcome.kind === 'failure')
    throw invariantViolationError({
      code: 'dead_webhook_event_list_unexpected_failure',
      message:
        'Dead webhook event listing returned an undeclared expected failure.',
      safeMessage: 'Dead webhook events could not be listed.',
    });

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        items: outcome.value.items.map((event) => ({
          ...event,
          sourceOccurredAt: event.sourceOccurredAt?.toISOString() ?? null,
          receivedAt: event.receivedAt.toISOString(),
        })),
        nextCursor:
          outcome.value.nextEventId === null
            ? null
            : encodeBase64UrlText(outcome.value.nextEventId),
        asOf: outcome.value.asOf.toISOString(),
      },
    },
  };
};

export const listDeadEventsHttpSurface = http.get<
  DeadWebhookEventsResult,
  ListDeadEventsExpectedFailure
>({
  path: '/webhook-ingestion/dead-letters',
  invalidRequest: {
    input: {
      code: 'invalid_query_type',
      message: 'Validation query failed.',
      safeMessage: 'Invalid request input.',
      status: 400,
      location: 'query',
    },
  },
  validateRequest: (request) => {
    deadWebhookEventsQuerySchema.parse(request.query);
    return undefined;
  },
  decodeAuthorizationScope: () => decode.valid('production:operations'),
  toSerializedInput: queryFrom,
  present,
}) satisfies HttpSurface<
  DeadWebhookEventsResult,
  ListDeadEventsExpectedFailure
>;
