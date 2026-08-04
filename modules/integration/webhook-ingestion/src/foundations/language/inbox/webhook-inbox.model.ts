import type { JsonValue } from '@pressly/codec';
import type { WebhookEventClaim } from './webhook-inbox.lifecycle.ts';

export type ClaimedWebhookEvent = Readonly<
  WebhookEventClaim & {
    source: string;
    eventType: string;
    subjectType: string;
    subjectId: string | null;
    sourceLocationId: string | null;
    sourceOccurredAt: Date | null;
    receivedAt: Date;
    payload: JsonValue;
    payloadHash: string;
    recoveredLease: boolean;
  }
>;

export type WebhookBacklog = Readonly<{
  pendingCount: number;
  oldestPendingAgeSeconds: number;
}>;
