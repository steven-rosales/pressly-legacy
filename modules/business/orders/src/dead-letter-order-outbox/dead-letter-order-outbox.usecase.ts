import {
  databaseError,
  mapUnknownError,
  validationError,
} from '@pressly/errors';
import { result } from '@pressly/kernel';
import type { OrderClockPort } from '../command-execution/order-command.port.ts';

import type { DeadLetterOrderOutbox } from '../order-outbox/order-outbox.port.ts';
import type { DeadLetterOrderOutboxRepository } from './dead-letter-order-outbox.port.ts';

export const makeDeadLetterOrderOutbox =
  (deps: {
    repo: DeadLetterOrderOutboxRepository;
    clock: OrderClockPort;
  }): DeadLetterOrderOutbox =>
  async (command) => {
    if (
      command.eventId.trim() === '' ||
      command.workerId.trim() === '' ||
      command.errorCode.trim() === '' ||
      command.errorMessage.trim() === ''
    )
      return result.err(
        validationError({
          code: 'order_outbox_dead_letter_invalid',
          message: 'The outbox dead-letter request is invalid.',
          safeMessage: 'The outbox dead-letter request is invalid.',
        }),
      );
    try {
      return result.ok({
        deadLettered: await deps.repo.deadLetter({
          command,
          now: deps.clock.now(),
        }),
      });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_outbox_dead_letter_failed',
            message: 'The order change could not be terminalized.',
            safeMessage: 'The order change could not be terminalized.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
