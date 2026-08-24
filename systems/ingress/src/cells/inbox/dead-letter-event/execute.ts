import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { WebhookEventCompletion } from '../../../model/inbox.ts';
import type {
  DeadLetterEventCommand,
  DeadLetterEventExpectedFailure,
  DeadLetterEventRepository,
} from './types.ts';

export const makeExecuteDeadLetterEvent =
  (repo: DeadLetterEventRepository) =>
  async (
    command: DeadLetterEventCommand,
  ): Promise<
    CellOutcome<WebhookEventCompletion, DeadLetterEventExpectedFailure>
  > => {
    try {
      return { kind: 'success', value: await repo.deadLetter(command) };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_event_dead_letter_failed',
          message: 'The webhook event could not be dead-lettered.',
          safeMessage: 'The webhook event could not be dead-lettered.',
          status: 503,
          cause,
        }),
      );
    }
  };
