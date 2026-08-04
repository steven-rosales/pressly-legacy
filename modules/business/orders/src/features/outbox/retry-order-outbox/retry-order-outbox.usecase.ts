import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';

import type {
  RetryOrderOutbox,
  RetryOrderOutboxRepository,
} from './retry-order-outbox.port.ts';

export const makeRetryOrderOutbox =
  (repo: RetryOrderOutboxRepository): RetryOrderOutbox =>
  async (command) => {
    try {
      return { retried: await repo.retry(command) };
    } catch (error) {
      throw mapUnknownError(error, (unknownCause) =>
        databaseError({
          code: 'order_outbox_retry_failed',
          message: 'The order change could not be returned for retry.',
          safeMessage: 'The order change could not be returned for retry.',
          status: 503,
          cause: unknownCause,
        }),
      );
    }
  };
