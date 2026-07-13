import type {
  DeadLetterWebhookEvent,
  FailWebhookEventRepository,
  RetryWebhookEvent,
} from './fail-event.port.ts';

export const makeRetryWebhookEvent = (
  repo: FailWebhookEventRepository,
): RetryWebhookEvent => repo.retry;

export const makeDeadLetterWebhookEvent = (
  repo: FailWebhookEventRepository,
): DeadLetterWebhookEvent => repo.deadLetter;
