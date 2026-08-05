import type { WebhookBacklog } from '../../../foundations/language/inbox/webhook-inbox.model.ts';

export type MeasureWebhookBacklog = () => Promise<WebhookBacklog>;

export type MeasureWebhookBacklogRepository = (
  now: Date,
) => Promise<WebhookBacklog>;
