import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../model/inbox.ts';

export const retryEventOperationId = 'ingress.retry-event.v1' as const;
export type RetryEventCommand = Readonly<
  WebhookEventClaim & {
    availableAt: Date;
    code: string;
    message: string;
  }
>;
export type RetryEventExpectedFailure = never;
export type RetryEventRepository = Readonly<{
  retry: (command: RetryEventCommand) => Promise<WebhookEventCompletion>;
}>;
