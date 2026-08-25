import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  RetryOrderOutboxCommand,
  RetryOrderOutboxExpectedFailure,
  RetryOrderOutboxRepository,
  RetryOrderOutboxResult,
} from './types.ts';

export const makeExecuteRetryOrderOutbox =
  (repository: RetryOrderOutboxRepository) =>
  async (
    command: RetryOrderOutboxCommand,
  ): Promise<
    CellOutcome<RetryOrderOutboxResult, RetryOrderOutboxExpectedFailure>
  > => {
    try {
      return {
        kind: 'success',
        value: { retried: await repository.retry(command) },
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_outbox_retry_failed',
          message: 'The order change could not be returned for retry.',
          safeMessage: 'The order change could not be returned for retry.',
          status: 503,
          cause,
        }),
      );
    }
  };
