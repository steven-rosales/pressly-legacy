export const replayDeadEventOperationId =
  'ingress.replay-dead-event.v1' as const;
export type ReplayDeadEventCommand = Readonly<{ eventId: string }>;
export type ReplayDeadEventExpectedFailure = Readonly<{
  kind: 'not_found' | 'conflict';
  code: 'webhook_event_not_found' | 'webhook_event_not_replayable';
  message: string;
  safeMessage: string;
}>;
export type ReplayDeadEventRepository = Readonly<{
  replay: (
    eventId: string,
    now: Date,
  ) => Promise<'queued' | 'already_queued' | 'not_found' | 'not_replayable'>;
}>;
export type ReplayDeadEventClock = Readonly<{ now: () => Date }>;
