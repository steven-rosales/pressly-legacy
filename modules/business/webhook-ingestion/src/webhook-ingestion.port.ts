export type WebhookIngestionClockPort = Readonly<{ now: () => Date }>;
export type WebhookIngestionIdPort = Readonly<{ next: () => string }>;

export type WebhookEventClaim = Readonly<{
  eventId: string;
  workerId: string;
  attempt: number;
}>;

export type WebhookEventCompletion = 'applied' | 'lease_lost';
