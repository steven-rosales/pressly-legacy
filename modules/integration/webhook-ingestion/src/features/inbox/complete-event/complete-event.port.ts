import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../foundations/language/inbox/webhook-inbox.lifecycle.ts';

export type CompleteWebhookEvent = (
  claim: WebhookEventClaim,
) => Promise<WebhookEventCompletion>;

export type CompleteWebhookEventRepository = Readonly<{
  complete: (
    claim: WebhookEventClaim & { processedAt: Date },
  ) => Promise<WebhookEventCompletion>;
}>;
