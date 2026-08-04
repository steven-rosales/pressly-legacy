import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../foundations/language/inbox/webhook-inbox.lifecycle.ts';

export type RetryWebhookEvent = (
  command: WebhookEventClaim & {
    availableAt: Date;
    code: string;
    message: string;
  },
) => Promise<WebhookEventCompletion>;
