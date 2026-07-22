import { result } from '@pressly/kernel';
import { orderError } from '../order.error.ts';
import type { RetryOrderOutbox } from '../orders.port.ts';
import type { RetryOrderOutboxRepository } from './retry-order-outbox.port.ts';

export const makeRetryOrderOutbox =
  (repo: RetryOrderOutboxRepository): RetryOrderOutbox =>
  async (command) => {
    try {
      return result.ok({ retried: await repo.retry(command) });
    } catch (error) {
      return result.err(
        orderError(
          'ORDER_OUTBOX_RETRY_FAILED',
          'The order change could not be returned for retry.',
          503,
          error,
        ),
      );
    }
  };
