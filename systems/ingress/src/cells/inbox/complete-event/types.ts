import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../model/inbox.ts';

export const completeEventOperationId = 'ingress.complete-event.v1' as const;
export type CompleteEventExpectedFailure = never;
export type CompleteEventRepository = Readonly<{
  complete: (
    claim: WebhookEventClaim & { processedAt: Date },
  ) => Promise<WebhookEventCompletion>;
}>;
export type CompleteEventClock = Readonly<{ now: () => Date }>;
