import type { ScheduleProposal, ScheduleRunParams } from '@pressly/contracts';
import type { AppError } from '@pressly/errors';
import type { Result } from '@pressly/kernel';

export type LoadSchedule = (
  command: ScheduleRunParams & { locationId: string },
) => Promise<Result<ScheduleProposal, AppError>>;

export type LoadScheduleRepository = Readonly<{
  loadSchedule: (
    locationId: string,
    scheduleRunId: string,
  ) => Promise<ScheduleProposal | null>;
}>;
