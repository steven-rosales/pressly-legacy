import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { DeadLetterWebhookEvent } from './dead-letter-event.port.ts';

const deadLetterStoreFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_event_dead_letter_failed',
      message: 'The webhook event could not be dead-lettered.',
      safeMessage: 'The webhook event could not be dead-lettered.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeDeadLetterWebhookEvent =
  (repo: DeadLetterWebhookEvent): DeadLetterWebhookEvent =>
  async (command) => {
    try {
      return await repo(command);
    } catch (error) {
      throw deadLetterStoreFailure(error);
    }
  };
