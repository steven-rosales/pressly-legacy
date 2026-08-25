import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { WebhookBacklog } from '../../../model/inbox.ts';
import type {
  MeasureWebhookBacklogClock,
  MeasureWebhookBacklogExpectedFailure,
  MeasureWebhookBacklogInput,
  MeasureWebhookBacklogRepository,
} from './types.ts';

export type MeasureWebhookBacklogDependencies = Readonly<{
  repo: MeasureWebhookBacklogRepository;
  clock: MeasureWebhookBacklogClock;
}>;

export const makeExecuteMeasureWebhookBacklog =
  (deps: MeasureWebhookBacklogDependencies) =>
  async (
    _input: MeasureWebhookBacklogInput,
  ): Promise<
    CellOutcome<WebhookBacklog, MeasureWebhookBacklogExpectedFailure>
  > => {
    try {
      return {
        kind: 'success',
        value: await deps.repo.measure(deps.clock.now()),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'webhook_backlog_measurement_failed',
          message: 'The webhook backlog could not be measured.',
          safeMessage: 'The webhook backlog could not be measured.',
          status: 503,
          cause,
        }),
      );
    }
  };
