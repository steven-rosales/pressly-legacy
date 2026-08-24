import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { WebhookEventCompletion } from '../../../model/inbox.ts';
import type {
  RetryEventCommand,
  RetryEventExpectedFailure,
  RetryEventRepository,
} from './types.ts';

export const makeExecuteRetryEvent =
  (repo: RetryEventRepository) =>
  async (
    command: RetryEventCommand,
  ): Promise<
    CellOutcome<WebhookEventCompletion, RetryEventExpectedFailure>
  > => {
    try {
      return { kind: 'success', value: await repo.retry(command) };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_event_retry_failed',
          message: 'The webhook event retry could not be scheduled.',
          safeMessage: 'The webhook event retry could not be scheduled.',
          status: 503,
          cause,
        }),
      );
    }
  };
