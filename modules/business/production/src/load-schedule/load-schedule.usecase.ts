import { result } from '@pressly/kernel';
import { productionError } from '../failure-mapping/production.error.ts';
import type {
  LoadSchedule,
  LoadScheduleRepository,
} from './load-schedule.port.ts';
export type { LoadSchedule } from './load-schedule.port.ts';

export const makeLoadSchedule =
  (repo: LoadScheduleRepository): LoadSchedule =>
  async ({ locationId, scheduleRunId }) => {
    const schedule = await repo.loadSchedule(locationId, scheduleRunId);

    return schedule === null
      ? result.err(
          productionError(
            'SCHEDULE_NOT_FOUND',
            'The schedule proposal was not found.',
            404,
          ),
        )
      : result.ok(schedule);
  };
