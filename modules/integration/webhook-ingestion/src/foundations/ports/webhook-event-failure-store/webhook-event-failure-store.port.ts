import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../language/inbox/webhook-inbox.lifecycle.ts';

export type WebhookEventFailureStore = Readonly<{
  retry: (
    command: WebhookEventClaim & {
      availableAt: Date;
      code: string;
      message: string;
    },
  ) => Promise<WebhookEventCompletion>;
  deadLetter: (
    command: WebhookEventClaim & { code: string; message: string },
  ) => Promise<WebhookEventCompletion>;
}>;
