import { type Database } from '@pressly/db/client';
import { and, eq } from '@pressly/db/query';
import * as laundryProduction from '@pressly/db/schema/laundry-production';
import type { LoadScheduleRepository } from './load-schedule.port.ts';
import { mapSchedule } from '../../../foundations/adapters/postgres/scheduling/production.persistence.mapper.ts';

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
