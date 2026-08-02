import { notFoundError } from '@pressly/errors';
import { result } from '@pressly/kernel';
import { toProductionDatabaseResult } from '../persistence/production-database-result.error.ts';
import type {
  LoadSchedule,
  LoadScheduleRepository,
} from './load-schedule.port.ts';
export type { LoadSchedule } from './load-schedule.port.ts';

export const makeLoadSchedule =
  (repo: LoadScheduleRepository): LoadSchedule =>
  async ({ locationId, scheduleRunId }) => {
    const loaded = await toProductionDatabaseResult(
      'SCHEDULE_LOAD_FAILED',
      'The schedule proposal could not be loaded.',
      () => repo.loadSchedule(locationId, scheduleRunId),
    );
    if (result.isErr(loaded)) return loaded;
    const schedule = loaded.value;

    return schedule === null
      ? result.err(
          notFoundError({
            code: 'schedule_not_found',
            message: 'The schedule proposal was not found.',
            safeMessage: 'The schedule proposal was not found.',
          }),
        )
      : result.ok(schedule);
  };
