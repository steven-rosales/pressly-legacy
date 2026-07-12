import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../webhook-ingestion.port.ts';

export type CompleteWebhookEvent = (
  claim: WebhookEventClaim,
) => Promise<WebhookEventCompletion>;

export type CompleteWebhookEventRepository = Readonly<{
  complete: (
    claim: WebhookEventClaim & { processedAt: Date },
  ) => Promise<WebhookEventCompletion>;
}>;
