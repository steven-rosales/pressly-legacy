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
