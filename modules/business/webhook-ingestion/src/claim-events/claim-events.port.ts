import type { WebhookEventClaim } from '../webhook-ingestion.port.ts';

export type ClaimedWebhookEvent = Readonly<
  WebhookEventClaim & {
    source: string;
    eventType: string;
    subjectType: string;
    subjectId: string | null;
    sourceLocationId: string | null;
    sourceOccurredAt: string | null;
    receivedAt: string;
    payload: unknown;
    payloadHash: string;
    recoveredLease: boolean;
  }
>;

export type ClaimWebhookEvents = (input: {
  workerId: string;
  leaseMs: number;
  limit: number;
}) => Promise<readonly ClaimedWebhookEvent[]>;

export type MeasureWebhookBacklog = () => Promise<
  Readonly<{ pendingCount: number; oldestPendingAgeSeconds: number }>
>;

export type ClaimWebhookEventsRepository = Readonly<{
  measureBacklog: (
    now: Date,
  ) => Promise<
    Readonly<{ pendingCount: number; oldestPendingAgeSeconds: number }>
  >;
  claim: (input: {
    workerId: string;
    now: Date;
    leaseMs: number;
    limit: number;
  }) => Promise<readonly ClaimedWebhookEvent[]>;
}>;
