import { databaseError, mapUnknownError } from '@pressly/errors';
import { result } from '@pressly/kernel';

import type { RetryOrderOutbox } from '../order-outbox/order-outbox.port.ts';
import type { RetryOrderOutboxRepository } from './retry-order-outbox.port.ts';

export const makeRetryOrderOutbox =
  (repo: RetryOrderOutboxRepository): RetryOrderOutbox =>
  async (command) => {
    try {
      return result.ok({ retried: await repo.retry(command) });
    } catch (error) {
      return result.err(
        mapUnknownError(error, (unknownCause) =>
          databaseError({
            code: 'order_outbox_retry_failed',
            message: 'The order change could not be returned for retry.',
            safeMessage: 'The order change could not be returned for retry.',
            status: 503,
            cause: unknownCause,
          }),
        ),
      );
    }
  };
