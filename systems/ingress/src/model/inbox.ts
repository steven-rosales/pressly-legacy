import type { JsonValue } from '@pressly/codec';

export type WebhookEventClaim = Readonly<{
  eventId: string;
  workerId: string;
  attempt: number;
}>;

export type WebhookEventCompletion = 'applied' | 'lease_lost';

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

export type IngestWebhookEventCommand = Readonly<{
  source: string;
  eventType: string;
  deduplicationKey: string;
  subjectType: string;
  subjectId: string | null;
  sourceLocationId: string | null;
  sourceOccurredAt: Date | null;
  payload: JsonValue;
  rawBodySha256: string;
  disposition: 'process' | 'ignore';
}>;

export type IngestWebhookEventResult = Readonly<{
  eventId: string;
  duplicate: boolean;
  status: 'pending' | 'ignored';
}>;

export type DeadWebhookEvent = Readonly<{
  eventId: string;
  source: string;
  eventType: string;
  subjectType: string;
  subjectId: string | null;
  sourceLocationId: string | null;
  sourceOccurredAt: Date | null;
  attempts: number;
  lastErrorCode: string | null;
  receivedAt: Date;
}>;

export type ListDeadWebhookEventsQuery = Readonly<{
  source?: string;
  afterEventId?: string;
  limit: number;
}>;

export type DeadWebhookEventsResult = Readonly<{
  items: readonly DeadWebhookEvent[];
  nextEventId: string | null;
  asOf: Date;
}>;

export type ReplayDeadWebhookEventResult = Readonly<{
  eventId: string;
  outcome: 'queued' | 'already_queued';
}>;
