export type ReplayDeadWebhookEventFailure = Readonly<{
  code: 'webhook_event_not_found' | 'webhook_event_not_replayable';
  message: string;
}>;

export const replayDeadWebhookEventFailure = Object.freeze({
  notFound: (): ReplayDeadWebhookEventFailure => ({
    code: 'webhook_event_not_found',
    message: 'The webhook event was not found.',
  }),
  notReplayable: (): ReplayDeadWebhookEventFailure => ({
    code: 'webhook_event_not_replayable',
    message: 'Only a dead or already queued webhook event can be replayed.',
  }),
});
