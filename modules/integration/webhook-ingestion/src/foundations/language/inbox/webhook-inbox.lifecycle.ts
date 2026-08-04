export type WebhookEventClaim = Readonly<{
  eventId: string;
  workerId: string;
  attempt: number;
}>;

export type WebhookEventCompletion = 'applied' | 'lease_lost';
