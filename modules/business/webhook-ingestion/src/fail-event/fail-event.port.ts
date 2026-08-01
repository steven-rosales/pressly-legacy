import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../ingestion/webhook-ingestion.port.ts';

export type RetryWebhookEvent = (
  command: WebhookEventClaim & {
    availableAt: Date;
    code: string;
    message: string;
  },
) => Promise<WebhookEventCompletion>;

export type DeadLetterWebhookEvent = (
  command: WebhookEventClaim & { code: string; message: string },
) => Promise<WebhookEventCompletion>;

export type FailWebhookEventRepository = Readonly<{
  retry: RetryWebhookEvent;
  deadLetter: DeadLetterWebhookEvent;
}>;
