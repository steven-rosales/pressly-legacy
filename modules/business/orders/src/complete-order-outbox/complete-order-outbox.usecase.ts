import { result } from '@pressly/kernel';
import { orderError } from '../order.error.ts';
import type { CompleteOrderOutbox, OrderClockPort } from '../orders.port.ts';
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
        orderError(
          'ORDER_OUTBOX_COMPLETION_FAILED',
          'The processed order change could not be acknowledged.',
          503,
          error,
        ),
      );
    }
  };
