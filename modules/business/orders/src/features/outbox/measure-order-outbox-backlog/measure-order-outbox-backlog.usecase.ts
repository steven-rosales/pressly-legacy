import { mapUnknownError, type AppError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { Clock } from '@pressly/time';
import type {
  MeasureOrderOutboxBacklog,
  MeasureOrderOutboxBacklogRepository,
} from './measure-order-outbox-backlog.port.ts';

const backlogMeasurementFailure = (cause: unknown): AppError =>
  mapUnknownError(cause, (unknownCause) =>
    databaseError({
      code: 'order_outbox_backlog_measurement_failed',
      message: 'The Order outbox backlog could not be measured.',
      safeMessage: 'The Order outbox backlog could not be measured.',
      status: 503,
      cause: unknownCause,
    }),
  );

export const makeMeasureOrderOutboxBacklog =
  (deps: {
    repo: MeasureOrderOutboxBacklogRepository;
    clock: Clock;
  }): MeasureOrderOutboxBacklog =>
  async () => {
    try {
      const now = deps.clock.now();
      const backlog = await deps.repo();

      return {
        pendingCount: backlog.pendingCount,
        oldestPendingAgeSeconds:
          backlog.oldestPendingAt === null
            ? 0
            : Math.max(
                0,
                (now.getTime() - backlog.oldestPendingAt.getTime()) / 1_000,
              ),
      };
    } catch (error) {
      throw backlogMeasurementFailure(error);
    }
  };
