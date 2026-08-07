import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import type {
  MeasureWebhookBacklog,
  MeasureWebhookBacklogRepository,
} from './measure-webhook-backlog.port.ts';

const backlogMeasurementFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'webhook_backlog_measurement_failed',
      message: 'The webhook backlog could not be measured.',
      safeMessage: 'The webhook backlog could not be measured.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeMeasureWebhookBacklog =
  (deps: {
    repo: MeasureWebhookBacklogRepository;
    clock: Clock;
  }): MeasureWebhookBacklog =>
  async () => {
    try {
      return await deps.repo(deps.clock.now());
    } catch (error) {
      throw backlogMeasurementFailure(error);
    }
  };
