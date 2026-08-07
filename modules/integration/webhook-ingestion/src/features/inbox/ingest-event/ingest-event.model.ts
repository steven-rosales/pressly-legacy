import type { JsonValue } from '@pressly/codec';

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
