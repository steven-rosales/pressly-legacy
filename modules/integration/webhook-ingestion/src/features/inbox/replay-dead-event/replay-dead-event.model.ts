export type ReplayDeadWebhookEventCommand = Readonly<{
  eventId: string;
}>;

export type ReplayDeadWebhookEventResult = Readonly<{
  eventId: string;
  outcome: 'queued' | 'already_queued';
}>;
