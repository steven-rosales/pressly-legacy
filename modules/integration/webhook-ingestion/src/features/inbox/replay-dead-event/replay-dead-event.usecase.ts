import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';
import type { DeadWebhookEventStore } from '../../../foundations/ports/dead-webhook-event-store/dead-webhook-event-store.port.ts';
import { replayDeadWebhookEventFailure } from './replay-dead-event.failure.ts';
import type { ReplayDeadWebhookEvent } from './replay-dead-event.port.ts';

const deadEventReplayFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'dead_webhook_event_replay_failed',
      message: 'The dead webhook event could not be replayed.',
      safeMessage: 'The dead webhook event could not be replayed.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeReplayDeadWebhookEvent =
  (deps: {
    store: DeadWebhookEventStore;
    clock: Clock;
  }): ReplayDeadWebhookEvent =>
  async ({ eventId }) => {
    let replayed: Awaited<ReturnType<DeadWebhookEventStore['replay']>>;
    try {
      replayed = await deps.store.replay(eventId, deps.clock.now());
    } catch (error) {
      throw deadEventReplayFailure(error);
    }

    if (replayed === 'not_found')
      return result.err(replayDeadWebhookEventFailure.notFound());
    if (replayed === 'not_replayable')
      return result.err(replayDeadWebhookEventFailure.notReplayable());
    return result.ok({ eventId, outcome: replayed });
  };
