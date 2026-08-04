import type { LoadScheduleFailure } from './load-schedule.failure.ts';
import type { Result } from '@pressly/kernel';
import type {
  LoadScheduleCommand,
  LoadScheduleResult,
} from './load-schedule.model.ts';

export type LoadSchedule = (
  command: LoadScheduleCommand,
) => Promise<Result<LoadScheduleResult, LoadScheduleFailure>>;

export type LoadScheduleRepository = Readonly<{
  loadSchedule: (
    locationId: string,
    scheduleRunId: string,
  ) => Promise<LoadScheduleResult | null>;
}>;
