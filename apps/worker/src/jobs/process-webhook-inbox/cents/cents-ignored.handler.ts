import type { WebhookEventConsumer } from '../webhook-inbox.job.ts';

/**
 * A deployment may still claim customer or marketing events that were queued
 * before the submitted-candidate adapter boundary was enabled. Acknowledge those
 * durable receipts without allowing them to reach canonical Users or Orders.
 */
export const makeIgnoredCentsEventHandler =
  (): WebhookEventConsumer => async () => ({ tag: 'ok' });
