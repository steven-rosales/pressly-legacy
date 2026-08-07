import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../foundations/language/inbox/webhook-inbox.lifecycle.ts';

export type DeadLetterWebhookEvent = (
  command: WebhookEventClaim & { code: string; message: string },
) => Promise<WebhookEventCompletion>;
