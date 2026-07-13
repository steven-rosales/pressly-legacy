import { and, eq, laundryProduction, type Database } from '@pressly/db';
import type { LoadScheduleRepository } from './load-schedule.port.ts';
import { mapSchedule } from '../persistence/production-mappers.ts';

export const makeLoadScheduleRepository = (
  db: Database,
): LoadScheduleRepository => ({
  loadSchedule: async (locationId, scheduleRunId) => {
    const [row] = await db
      .select()
      .from(laundryProduction.scheduleRuns)
      .where(
        and(
          eq(laundryProduction.scheduleRuns.locationId, locationId),
          eq(laundryProduction.scheduleRuns.id, scheduleRunId),
        ),
      )
      .limit(1);
    return row === undefined ? null : mapSchedule(row);
  },
});
