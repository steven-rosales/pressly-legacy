import type { WebhookBacklog } from '../../../model/inbox.ts';

export const measureWebhookBacklogOperationId =
  'ingress.measure-webhook-backlog.v1' as const;

export type MeasureWebhookBacklogInput = Readonly<Record<string, never>>;
export type MeasureWebhookBacklogExpectedFailure = never;

export type MeasureWebhookBacklogRepository = Readonly<{
  measure: (now: Date) => Promise<WebhookBacklog>;
}>;

export type MeasureWebhookBacklogClock = Readonly<{ now: () => Date }>;
