import type { CellOutcome } from '@pressly/cells';
import { mapUnknownError } from '@pressly/errors/app-error';
import { databaseError } from '@pressly/errors/factories';
import type { OrderOutboxBacklog } from '../../../model/order-outbox/model.ts';
import { projectOrderOutboxBacklog } from './project.ts';
import type {
  MeasureOrderOutboxBacklogClock,
  MeasureOrderOutboxBacklogExpectedFailure,
  MeasureOrderOutboxBacklogInput,
  MeasureOrderOutboxBacklogRepository,
} from './types.ts';

export type MeasureOrderOutboxBacklogDependencies = Readonly<{
  repo: MeasureOrderOutboxBacklogRepository;
  clock: MeasureOrderOutboxBacklogClock;
}>;

export const makeExecuteMeasureOrderOutboxBacklog =
  (dependencies: MeasureOrderOutboxBacklogDependencies) =>
  async (
    _input: MeasureOrderOutboxBacklogInput,
  ): Promise<
    CellOutcome<OrderOutboxBacklog, MeasureOrderOutboxBacklogExpectedFailure>
  > => {
    try {
      const now = dependencies.clock.now();
      const stored = await dependencies.repo.measure();
      return {
        kind: 'success',
        value: projectOrderOutboxBacklog({ stored, now }),
      };
    } catch (error) {
      throw mapUnknownError(error, (cause) =>
        databaseError({
          code: 'order_outbox_backlog_measurement_failed',
          message: 'The Order outbox backlog could not be measured.',
          safeMessage: 'The Order outbox backlog could not be measured.',
          status: 503,
          cause,
        }),
      );
    }
  };
