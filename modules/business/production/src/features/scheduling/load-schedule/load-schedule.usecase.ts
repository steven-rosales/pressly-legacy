import { notFoundFailure } from '../../../foundations/language/failures/production-failure.factory.ts';
import { result } from '@pressly/kernel';
import { withProductionDatabaseError } from '../../../foundations/adapters/postgres/commands/production-database-error.adapter.ts';
import type {
  LoadSchedule,
  LoadScheduleRepository,
} from './load-schedule.port.ts';
export type { LoadSchedule } from './load-schedule.port.ts';

export const makeLoadSchedule =
  (repo: LoadScheduleRepository): LoadSchedule =>
  async ({ locationId, scheduleRunId }) => {
    const schedule = await withProductionDatabaseError(
      'SCHEDULE_LOAD_FAILED',
      'The schedule proposal could not be loaded.',
      () => repo.loadSchedule(locationId, scheduleRunId),
    );
    return schedule === null
      ? result.err(
          notFoundFailure({
            code: 'schedule_not_found',
            message: 'The schedule proposal was not found.',
            safeMessage: 'The schedule proposal was not found.',
          }),
        )
      : result.ok(schedule);
  };
