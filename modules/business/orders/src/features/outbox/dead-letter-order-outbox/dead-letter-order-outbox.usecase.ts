import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import { result } from '@pressly/kernel';
import type { Clock } from '@pressly/time';

import type {
  DeadLetterOrderOutbox,
  DeadLetterOrderOutboxRepository,
} from './dead-letter-order-outbox.port.ts';
import { deadLetterOrderOutboxFailure } from './dead-letter-order-outbox.failure.ts';

export const makeDeadLetterOrderOutbox =
  (deps: {
    repo: DeadLetterOrderOutboxRepository;
    clock: Clock;
  }): DeadLetterOrderOutbox =>
  async (command) => {
    if (
      command.eventId.trim() === '' ||
      command.workerId.trim() === '' ||
      command.errorCode.trim() === '' ||
      command.errorMessage.trim() === ''
    )
      return result.err(deadLetterOrderOutboxFailure.invalid());
    try {
      return result.ok({
        deadLettered: await deps.repo.deadLetter({
          command,
          now: deps.clock.now(),
        }),
      });
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_outbox_dead_letter_failed',
          message: 'The order change could not be terminalized.',
          safeMessage: 'The order change could not be terminalized.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
