import { makeAppError } from '@pressly/errors';
import type { ClaimedWebhookEvent } from '@pressly/webhook-ingestion';
import type {
  EventConsumerOutcome,
  WebhookEventConsumer,
} from './webhook-inbox.job.ts';

export const webhookConsumerKey = (event: {
  source: string;
  subjectType: string;
}): string => `${event.source}:${event.subjectType}`;

export const makeWebhookEventDispatcher =
  (
    consumers: Readonly<Record<string, WebhookEventConsumer>>,
  ): WebhookEventConsumer =>
  async (event: ClaimedWebhookEvent): Promise<EventConsumerOutcome> => {
    const consumer = consumers[webhookConsumerKey(event)];
    if (consumer !== undefined) return consumer(event);
    return {
      tag: 'err',
      retryable: false,
      error: makeAppError({
        kind: 'ValidationError',
        code: 'webhook_event_consumer_missing',
        message: `No consumer is registered for ${webhookConsumerKey(event)}.`,
        safeMessage: 'No consumer is registered for this webhook event.',
        status: 422,
      }),
    };
  };
