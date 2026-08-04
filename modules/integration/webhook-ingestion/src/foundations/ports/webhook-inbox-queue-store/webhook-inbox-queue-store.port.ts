import type {
  ClaimedWebhookEvent,
  WebhookBacklog,
} from '../../language/inbox/webhook-inbox.model.ts';

export type WebhookInboxQueueStore = Readonly<{
  measureBacklog: (now: Date) => Promise<WebhookBacklog>;
  claim: (input: {
    workerId: string;
    now: Date;
    leaseMs: number;
    limit: number;
  }) => Promise<readonly ClaimedWebhookEvent[]>;
}>;
