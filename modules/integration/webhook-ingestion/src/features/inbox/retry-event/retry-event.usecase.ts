import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { RetryWebhookEvent } from './retry-event.port.ts';

const retryStoreFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_event_retry_failed',
      message: 'The webhook event retry could not be scheduled.',
      safeMessage: 'The webhook event retry could not be scheduled.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeRetryWebhookEvent =
  (repo: RetryWebhookEvent): RetryWebhookEvent =>
  async (command) => {
    try {
      return await repo(command);
    } catch (error) {
      throw retryStoreFailure(error);
    }
  };
