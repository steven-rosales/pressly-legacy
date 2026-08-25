import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type {
  WebhookEventClaim,
  WebhookEventCompletion,
} from '../../../model/inbox.ts';
import type {
  CompleteEventClock,
  CompleteEventExpectedFailure,
  CompleteEventRepository,
} from './types.ts';

export type CompleteEventDependencies = Readonly<{
  repo: CompleteEventRepository;
  clock: CompleteEventClock;
}>;

export const makeExecuteCompleteEvent =
  (deps: CompleteEventDependencies) =>
  async (
    command: WebhookEventClaim,
  ): Promise<
    CellOutcome<WebhookEventCompletion, CompleteEventExpectedFailure>
  > => {
    try {
      return {
        kind: 'success',
        value: await deps.repo.complete({
          ...command,
          processedAt: deps.clock.now(),
        }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_event_completion_failed',
          message: 'The webhook event could not be completed.',
          safeMessage: 'The webhook event could not be completed.',
          status: 503,
          cause,
        }),
      );
    }
  };
