import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import type { WebhookInboxQueueStore } from '../../../foundations/ports/webhook-inbox-queue-store/webhook-inbox-queue-store.port.ts';
import type { MeasureWebhookBacklog } from './measure-webhook-backlog.port.ts';

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
    store: WebhookInboxQueueStore;
    clock: Clock;
  }): MeasureWebhookBacklog =>
  async () => {
    try {
      return await deps.store.measureBacklog(deps.clock.now());
    } catch (error) {
      throw backlogMeasurementFailure(error);
    }
  };
