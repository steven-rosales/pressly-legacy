import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';

import type {
  CompleteOrderOutbox,
  CompleteOrderOutboxRepository,
} from './complete-order-outbox.port.ts';

export const makeCompleteOrderOutbox =
  (deps: {
    repo: CompleteOrderOutboxRepository;
    clock: Clock;
  }): CompleteOrderOutbox =>
  async (command) => {
    try {
      return {
        completed: await deps.repo.complete({
          command,
          now: deps.clock.now(),
        }),
      };
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_outbox_completion_failed',
          message: 'The processed order change could not be acknowledged.',
          safeMessage: 'The processed order change could not be acknowledged.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
