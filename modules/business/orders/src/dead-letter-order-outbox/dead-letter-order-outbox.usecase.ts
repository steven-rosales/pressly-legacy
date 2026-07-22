import { result } from '@pressly/kernel';
import { orderError } from '../order.error.ts';
import type { DeadLetterOrderOutbox, OrderClockPort } from '../orders.port.ts';
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
        orderError(
          'ORDER_OUTBOX_DEAD_LETTER_INVALID',
          'The outbox dead-letter request is invalid.',
          400,
        ),
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
        orderError(
          'ORDER_OUTBOX_DEAD_LETTER_FAILED',
          'The order change could not be terminalized.',
          503,
          error,
        ),
      );
    }
  };
