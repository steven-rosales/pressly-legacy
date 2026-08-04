import type { WebhookBacklog } from '../../../foundations/language/inbox/webhook-inbox.model.ts';

export type MeasureWebhookBacklog = () => Promise<WebhookBacklog>;
