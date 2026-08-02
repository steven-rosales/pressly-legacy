import { databaseError, mapUnknownError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';

import type { CompleteOrderOutbox } from '../order-outbox/order-outbox.port.ts';
import type { CompleteOrderOutboxRepository } from './complete-order-outbox.port.ts';

export const makeCompleteOrderOutbox =
  (deps: {
    repo: CompleteOrderOutboxRepository;
    clock: OrderClockPort;
  }): CompleteOrderOutbox =>
  async (command) => {
    try {
      return result.ok({
        completed: await deps.repo.complete({
          command,
          now: deps.clock.now(),
        }),
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_outbox_completion_failed',
            message: 'The processed order change could not be acknowledged.',
            safeMessage:
              'The processed order change could not be acknowledged.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
