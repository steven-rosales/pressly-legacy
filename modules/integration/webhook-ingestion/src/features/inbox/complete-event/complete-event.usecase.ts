import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import type {
  CompleteWebhookEvent,
  CompleteWebhookEventRepository,
} from './complete-event.port.ts';

export const makeCompleteWebhookEvent =
  (deps: {
    repo: CompleteWebhookEventRepository;
    clock: Clock;
  }): CompleteWebhookEvent =>
  async (claim) => {
    try {
      return await deps.repo.complete({
        ...claim,
        processedAt: deps.clock.now(),
      });
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'webhook_event_completion_failed',
          message: 'The webhook event could not be completed.',
          safeMessage: 'The webhook event could not be completed.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
